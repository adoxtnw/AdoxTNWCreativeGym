"use strict";
/* NEURO-METRO: AVUI — MAP — camera, rasteriser and input
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   THE PICTURE IS RASTERISED BY HAND, one pixel at a time, into an ImageData
   and then upscaled by an integer factor with `image-rendering:pixelated` —
   the same technique as the battle system's rings and gauges. Canvas strokes
   are NOT used: `imageSmoothingEnabled` governs image scaling only, so a
   stroked line antialiases into grey half-pixels regardless, and upscaling
   those gives soft-edged blocks instead of pixel art.

   THE MAP IS DRAWN AT EVERY ZOOM, never scaled as a picture. Geometry is
   transformed into buffer space and rasterised there, so nothing ever goes
   soft. That is also why zoom can be continuous without breaking the medium.

   TWO CLOCKS, ON PURPOSE.
     · Camera moves — pan, and the eased zoom — are immediate, at whatever
       rate the display runs. They are direct manipulation: the map has to sit
       under the finger, and quantising that to 83ms reads as broken rather
       than as stylised.
     · Everything that animates BY ITSELF — station states, and whatever comes
       after them — runs off `frame`, which ticks at 12 fps like the rest of
       the game. A stepped effect next to a smooth one is instantly the wrong
       medium, so new animation belongs on `frame`, never on rAF.           */

const PX = 3;                       /* screen pixels per art pixel */
const MAX_Z = 3.0;                  /* art pixels per world unit, zoomed in  */
const STEP_MS = 83;                 /* 12 fps, the house cadence             */

/* At what zoom each tier of detail is worth drawing. With 110 stations, a map
   that draws everything at every scale is an unreadable smear when zoomed out;
   these are the thresholds at which a real diagram would drop detail too. */
const DOT_Z    = 0.30;              /* below: interchanges only, minor stops vanish */
const HUB_TX_Z = 0.20;              /* interchange names are always worth trying    */
const LABEL_Z  = 0.62;              /* below: minor stop names stay off             */

const BG      = [15, 13, 11];       /* --void  */
const GRID    = [32, 29, 25];
const INK     = [244, 239, 228];    /* --ink   */
const MUTED   = [154, 143, 128];    /* --muted */
const CHIPINK = [12, 10, 22];
const SHADOW  = [8, 6, 4];

const cam = {x: 0, y: 0, z: 1, tz: null, ax: 0, ay: 0};
let cv, ctx, img, buf, W = 0, H = 0, dirty = true;
let frame = 0, lastStep = 0, liveStates = false;

const packRGB = c => (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---------------------------------------------------------------- raster -- */
/* THE WIPE IS A CLIP, not a second canvas. Because the map and the travel
   screen are rasterised by the same code into the same buffer, revealing one
   through a growing hole in the other only needs every write to ask whether it
   is inside the circle. Null the rest of the time, so the branch is all it
   costs. See journey.js. */
let clipC = null;

function plot(x, y, col){
  x |= 0; y |= 0;
  if(x < 0 || y < 0 || x >= W || y >= H) return;
  if(clipC){ const dx = x - clipC.x, dy = y - clipC.y; if(dx*dx + dy*dy > clipC.r2) return; }
  buf[y * W + x] = col;
}
/* CLEARING THE SCREEN HAS TO RESPECT THE CLIP TOO. `buf.fill()` writes the
   typed array directly and so goes straight past `plot`, which meant the
   incoming screen ERASED the outgoing one instead of being revealed through
   it — the wipe showed a hole onto a blank void rather than onto the map.
   Clipped, only the disc is cleared, one span per row. */
function fillScene(col){
  if(!clipC){ buf.fill(col); return; }
  const r = Math.ceil(Math.sqrt(clipC.r2));
  for(let dy = -r; dy <= r; dy++){
    const y = clipC.y + dy;
    if(y < 0 || y >= H) continue;
    const half = Math.floor(Math.sqrt(Math.max(0, clipC.r2 - dy * dy)));
    const x0 = Math.max(0, clipC.x - half), x1 = Math.min(W - 1, clipC.x + half);
    for(let x = x0; x <= x1; x++) buf[y * W + x] = col;
  }
}
/* A circle's outline, thick and blended — the wipe's leading edge, and the
   rings that swell out of the player's station. */
function ringA(cx, cy, r, thick, col, a){
  const ro = r + thick / 2, ri = Math.max(0, r - thick / 2);
  const ro2 = ro * ro, ri2 = ri * ri, n = Math.ceil(ro);
  for(let dy = -n; dy <= n; dy++)
    for(let dx = -n; dx <= n; dx++){
      const d2 = dx * dx + dy * dy;
      if(d2 <= ro2 && d2 >= ri2) blendPx(cx + dx, cy + dy, col, a);
    }
}
/* Separate radii, so the player's station can squash rather than merely pulse. */
function ellipse(cx, cy, rx, ry, col){
  const nx = Math.ceil(rx), ny = Math.ceil(ry);
  for(let dy = -ny; dy <= ny; dy++)
    for(let dx = -nx; dx <= nx; dx++)
      if((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.06) plot(cx + dx, cy + dy, col);
}
function disc(cx, cy, r, col){
  if(r < 0) return;
  const rr = (r + 0.35) * (r + 0.35);
  for(let dy = -r; dy <= r; dy++)
    for(let dx = -r; dx <= r; dx++)
      if(dx * dx + dy * dy <= rr) plot(cx + dx, cy + dy, col);
}
function rect(x, y, w, h, col){
  for(let dy = 0; dy < h; dy++)
    for(let dx = 0; dx < w; dx++) plot(x + dx, y + dy, col);
}
/* A SQUARE brush, stepped one pixel at a time along the dominant axis. Every
   segment is axis-aligned or exactly 45 degrees once net.js has squared the
   link, so this is exact — no error term to carry, and diagonals come out as
   clean stair-steps of constant thickness rather than a tapering ribbon. */
function thickLine(x0, y0, x1, y1, w, col){
  const r = (w - 1) >> 1, dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy)) | 0;
  if(n === 0){ rect(x0 - r, y0 - r, w, w, col); return; }
  for(let i = 0; i <= n; i++){
    const x = Math.round(x0 + dx * i / n), y = Math.round(y0 + dy * i / n);
    rect(x - r, y - r, w, w, col);
  }
}
function glyph(g, x, y, col){
  for(let r = 0; r < FONT_H; r++)
    for(let c = 0; c < FONT_W; c++)
      if(g[r][c] === "x") plot(x + c, y + r, col);
}
/* `al`: -1 ends at x, 0 centred on x, 1 starts at x. `y` is the glyph TOP. */
function text(s, x, y, col, al, shadow){
  s = foldText(s);
  const w = textW(s);
  const px = al < 0 ? x - w : al > 0 ? x : x - (w >> 1);
  if(shadow !== false){
    const sh = packRGB(SHADOW);
    for(let i = 0; i < s.length; i++){
      const g = GLYPHS[s[i]]; if(g) glyph(g, px + i * FONT_ADV + 1, y + 1, sh);
    }
  }
  for(let i = 0; i < s.length; i++){
    const g = GLYPHS[s[i]]; if(g) glyph(g, px + i * FONT_ADV, y, col);
  }
}
/* The same font, drawn n pixels to the pixel. Scaling the GLYPH rather than
   using a bigger typeface is the point: the announcement and the arrival
   banner have to be made of the same blocks as everything else, and a real
   font scaled up would arrive smooth against a screen that is not. */
function textScaled(s, x, y, col, al, sc){
  s = foldText(s);
  const w = textW(s) * sc;
  const px = al < 0 ? x - w : al > 0 ? x : x - (w >> 1);
  for(let i = 0; i < s.length; i++){
    const g = GLYPHS[s[i]]; if(!g) continue;
    const gx = px + i * FONT_ADV * sc;
    for(let r = 0; r < FONT_H; r++)
      for(let c = 0; c < FONT_W; c++)
        if(g[r][c] === "x") rect(gx + c * sc, y + r * sc, sc, sc, col);
  }
}

/* ---------------------------------------------------------------- camera -- */
const bx = wx => (wx - cam.x) * cam.z + W / 2;
const by = wy => (wy - cam.y) * cam.z + H / 2;

/* The margin around the network, in SCREEN pixels — wide enough for a
   terminus badge and a station name. It is screen-space because what has to
   fit is screen-space: hold it in world units and it shrinks exactly when you
   zoom out, which is when it is needed. */
const PAD_S = 22;
const fitY = () => (H - PAD_S * 2) / NET_BOX.h;
const fitZ = () => Math.max(0.02, Math.min((W - PAD_S * 2) / NET_BOX.w, fitY()));
const padBox = () => {
  const p = PAD_S / cam.z;
  return {x0: NET_BOX.x0 - p, x1: NET_BOX.x1 + p,
          y0: NET_BOX.y0 - p, y1: NET_BOX.y1 + p};
};
function clampCam(){
  const b = padBox(), hw = W / (2 * cam.z), hh = H / (2 * cam.z);
  cam.x = (b.x1 - b.x0) <= hw * 2 ? (b.x0 + b.x1) / 2 : clamp(cam.x, b.x0 + hw, b.x1 - hw);
  cam.y = (b.y1 - b.y0) <= hh * 2 ? (b.y0 + b.y1) / 2 : clamp(cam.y, b.y0 + hh, b.y1 - hh);
}
/* Zoom about a point: whatever world position sits under (px,py) must still
   sit there afterwards, or zooming feels like it shoves the map around. */
function applyZoom(nz, px, py){
  nz = clamp(nz, fitZ(), MAX_Z);
  const wx = cam.x + (px - W / 2) / cam.z, wy = cam.y + (py - H / 2) / cam.z;
  cam.z = nz;
  cam.x = wx - (px - W / 2) / nz;
  cam.y = wy - (py - H / 2) / nz;
  clampCam(); dirty = true;
}
function zoomTo(nz, px, py){
  cam.tz = clamp(nz, fitZ(), MAX_Z); cam.ax = px; cam.ay = py; dirty = true;
}

/* ------------------------------------------------------------------ draw -- */
/* Line weight and dot size by zoom.

   NEVER THINNER THAN TWO PIXELS. A one-pixel line looks correct standing
   still, but the turbulence filter displaces by several screen pixels and a
   hairline simply comes apart under it — at fit zoom the whole network showed
   as dashes. Two pixels is the width at which a line survives being pushed
   around. (Two cannot centre exactly on a pixel and so shifts by half of one
   as you pan; at these sizes that is invisible, and it is much the lesser of
   the two faults.) */
function gauge(z){
  if(z < 0.30) return {w: 2, r: 1, ri: 2};
  if(z < 0.55) return {w: 2, r: 2, ri: 3};
  if(z < 0.95) return {w: 3, r: 3, ri: 4};
  if(z < 1.90) return {w: 3, r: 4, ri: 6};
  return              {w: 5, r: 6, ri: 8};
}
function drawGrid(){
  /* Empty space needs texture or panning across it looks like nothing is
     happening. Spacing adapts so the dots never crowd or vanish. */
  const g = packRGB(GRID);
  let step = 10; while(step * cam.z < 11) step *= 2;
  const x0 = Math.floor((cam.x - W / (2 * cam.z)) / step) * step;
  const y0 = Math.floor((cam.y - H / (2 * cam.z)) / step) * step;
  for(let wy = y0; by(wy) < H + step; wy += step)
    for(let wx = x0; bx(wx) < W + step; wx += step) plot(bx(wx), by(wy), g);
}
function drawLines(w){
  LINES.forEach(l => {
    const col = packRGB(lineRGB(l)), p = l._path;
    for(let i = 0; i < p.length - 1; i++){
      const ax = bx(p[i][0]), ay = by(p[i][1]);
      const bx2 = bx(p[i + 1][0]), by2 = by(p[i + 1][1]);
      /* whole segment off-screen: skip before rasterising hundreds of pixels */
      if((ax < -20 && bx2 < -20) || (ax > W + 20 && bx2 > W + 20) ||
         (ay < -20 && by2 < -20) || (ay > H + 20 && by2 > H + 20)) continue;
      thickLine(ax, ay, bx2, by2, w, col);
    }
  });
}

/* The painter handed to a station state. States never touch the frame buffer,
   so the rasteriser stays swappable; and it is one reused object rather than
   one per station per frame. */
const brush = {
  x: 0, y: 0, r: 0, z: 1, t: 0, col: INK,
  plot: (x, y, c) => plot(x, y, packRGB(c)),
  disc: (x, y, r, c) => disc(x, y, r, packRGB(c)),
  rect: (x, y, w, h, c) => rect(x, y, w, h, packRGB(c)),
  text: (s, x, y, c, al) => text(s, x, y, packRGB(c), al)
};
function brushAt(x, y, r, col){
  brush.x = x; brush.y = y; brush.r = r; brush.z = cam.z; brush.t = frame;
  brush.col = col; return brush;
}
function drawStops(g){
  const ink = packRGB(INK), dark = packRGB(CHIPINK);
  const minor = cam.z >= DOT_Z;
  Object.keys(STATIONS).forEach(id => {
    const s = STATIONS[id], hub = isInterchange(id);
    if(!hub && !minor) return;
    const x = bx(s.x) | 0, y = by(s.y) | 0, r = hub ? g.ri : g.r;
    if(x < -r - 6 || y < -r - 6 || x > W + r + 6 || y > H + r + 6) return;

    const base = hub ? INK : lineRGB(LINES_AT[id][0]);
    const fx = StationFx.of(s.state), b = fx ? brushAt(x, y, r, base) : null;
    if(fx && fx.under) fx.under(s, b);

    const rim  = (fx && fx.ring && fx.ring(s, b)) || null;
    const core = (fx && fx.fill && fx.fill(s, b)) || null;
    if(hub){
      /* one white blob with a dark rim, whatever colours meet there — the
         reference map's language for "you can change here" */
      disc(x, y, r,     rim ? packRGB(rim) : dark);
      disc(x, y, r - 1, core ? packRGB(core) : ink);
    }else if(r >= 3){
      disc(x, y, r,     rim ? packRGB(rim) : packRGB(base));
      disc(x, y, r - 2, core ? packRGB(core) : ink);
    }else{
      /* Too small for a ring: at this size the rim and the core fight for the
         same three pixels and every stop turns into a smudge. A plain bead on
         the line is what a real diagram shrinks to. */
      disc(x, y, r - 1, core ? packRGB(core) : (rim ? packRGB(rim) : ink));
    }
    if(fx && fx.over) fx.over(s, b);
  });
}
/* A line badge at each terminus, pushed along the direction the line was
   travelling when it ran out — so it never lands on top of its own track. */
function badges(w){
  const out = [];
  LINES.forEach(l => {
    const p = l._path, cw = textW(l.id) + 4, ch = FONT_H + 4;
    [[p[0], p[1]], [p[p.length - 1], p[p.length - 2]]].forEach(([end, prev]) => {
      const dx = end[0] - prev[0], dy = end[1] - prev[1];
      const m = Math.hypot(dx, dy) || 1, off = w + 8;
      const x = (bx(end[0]) + dx / m * off) | 0, y = (by(end[1]) + dy / m * off) | 0;
      if(x < -20 || y < -20 || x > W + 20 || y > H + 20) return;
      out.push({l, x, y, cw, ch,
                x0: x - (cw >> 1), x1: x + (cw >> 1),
                y0: y - (ch >> 1), y1: y + (ch >> 1)});
    });
  });
  return out;
}
function drawBadges(bs){
  bs.forEach(b => {
    rect(b.x0, b.y0, b.cw, b.ch, packRGB(lineRGB(b.l)));
    text(b.l.id, b.x, b.y0 + 2, packRGB(CHIPINK), 0, false);
  });
}
/* Where a name sits relative to its dot. The SIDE was chosen once, in net.js,
   from the directions of the track meeting there; the DISTANCE is in screen
   pixels so a name keeps its gap at every zoom. */
function labelBox(s, r){
  const w = textW(foldText(s.name)), gap = r + 3;
  let x, y, al;
  if(s.side === "R"){ x = s._bx + gap;  y = s._by - 2; al = 1; }
  else if(s.side === "L"){ x = s._bx - gap; y = s._by - 2; al = -1; }
  else if(s.side === "B"){ x = s._bx; y = s._by + gap; al = 0; }
  else { x = s._bx; y = s._by - gap - FONT_H; al = 0; }
  const x0 = al < 0 ? x - w : al > 0 ? x : x - (w >> 1);
  return {x, y, al, x0, x1: x0 + w, y0: y, y1: y + FONT_H};
}
const hits = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/* GREEDY DECLUTTER. With 110 names there is no zoom at which they all fit, so
   rather than let them pile into illegible mush, a name is simply dropped if
   it would land on something already placed. Interchanges are placed first, so
   the names that survive when space is tight are the ones that matter. This is
   also what makes zooming feel like it reveals the map rather than magnifying
   a fixed picture. */
function drawLabels(g, taken){
  const hubs = [], rest = [];
  Object.keys(STATIONS).forEach(id => {
    const s = STATIONS[id];
    s._bx = bx(s.x) | 0; s._by = by(s.y) | 0;
    if(s._bx < -90 || s._by < -20 || s._bx > W + 90 || s._by > H + 20) return;
    (isInterchange(id) ? hubs : rest).push(s);
  });
  const order = [];
  if(cam.z >= HUB_TX_Z) order.push.apply(order, hubs);
  if(cam.z >= LABEL_Z)  order.push.apply(order, rest);

  /* THE PLAYER'S OWN STATION IS NAMED FIRST, and only then does the marker's
     footprint start blocking. The marker is painted on top of everything, so
     without reserving its space it wrote over whatever name sat next door —
     CLOT swallowed the B of BAC DE RODA. Reserving it BEFORE its own name is
     placed would instead hide the one name most worth having: where you are
     standing. So: place that one, then reserve, then everyone else. */
  const me = STATIONS[J.at];
  const i = order.indexOf(me);
  if(i > 0){ order.splice(i, 1); order.unshift(me); }

  const place = s => {
    const hub = isInterchange(s.id);
    const box = labelBox(s, hub ? g.ri : g.r);
    /* WHOLE NAME OR NONE. Letting a name run off the edge cuts it mid-word —
       ESPANYA arrives as "PANYA" — which reads as a rendering fault rather
       than as an edge. Dropping it instead means names appear as you pan to
       them, the way they do on any map. */
    if(box.x0 < 0 || box.x1 > W || box.y0 < 0 || box.y1 > H) return;
    for(let k = 0; k < taken.length; k++) if(hits(box, taken[k])) return;
    const fx = StationFx.of(s.state);
    const tint = fx && fx.ink && fx.ink(s, brushAt(s._bx, s._by, g.r, INK));
    text(s.name, box.x, box.y, packRGB(tint || (hub ? INK : MUTED)), box.al);
    /* A two-pixel cushion, so names that merely TOUCH still count as colliding
       — without it LLACUNA and POBLENOU ran together into one word. Two rather
       than one because the turbulence filter shoves everything a few screen
       pixels sideways, and a one-pixel gap does not survive that. */
    taken.push({x0: box.x0 - 2, x1: box.x1 + 2, y0: box.y0 - 1, y1: box.y1 + 1});
  };

  order.forEach((s, n) => {
    place(s);
    if(n === 0 && s === me) taken.push(markerBox(g));
  });
}
/* What the player marker covers: the station, its glow, the widest the
   travelling ring gets, AND the tag stack above it — name, MS/EC, and the
   OVERFLOW warning. All of that is painted last and so paints OVER any name
   that was placed there, which had PASSENGER stamped across CAMP DE L'ARPA.
   Reserving it is what keeps the surrounding labels out of the way. */
function markerBox(g){
  const x = bx(J.markX) | 0, y = by(J.markY) | 0;
  const r = (isInterchange(J.at) ? g.ri : g.r) + 1 + 5;
  const tag = Math.max(textW(foldText(Player.name || "")),
                       textW("OVERFLOW"),
                       textW(Math.round(Player.ms) + " " + Math.round(Player.ec)));
  const half = Math.max(r, (tag >> 1) + 5);   /* a real gap, not a shave */
  /* the arrow sits ~8 above the dot and the stack climbs three rows from there */
  const top = y - r - 8 - (FONT_H + 3) * 3 - 2;
  return {x0: x - half, x1: x + half, y0: top, y1: y + r};
}
/* Every dot a name must not be written over. A station never blocks its OWN
   name — the label is offset by r+3, so it starts just clear of its own dot —
   but it does block its neighbours', which is what stops a name from being
   stamped across the station next door. */
function dotBoxes(g){
  const out = [], minor = cam.z >= DOT_Z;
  Object.keys(STATIONS).forEach(id => {
    const hub = isInterchange(id);
    if(!hub && !minor) return;
    const s = STATIONS[id], x = bx(s.x) | 0, y = by(s.y) | 0, r = hub ? g.ri : g.r;
    if(x < -r - 6 || y < -r - 6 || x > W + r + 6 || y > H + r + 6) return;
    out.push({x0: x - r, x1: x + r + 1, y0: y - r, y1: y + r + 1});
  });
  return out;
}
function drawMapScene(g){
  fillScene(packRGB(BG));
  drawGrid();
  drawLines(g.w);
  const bs = badges(g.w);
  drawStops(g);
  drawBadges(bs);
  drawLabels(g, bs.concat(dotBoxes(g)));
  drawPlayer(g);
}
function draw(){
  const g = gauge(cam.z);
  drawScene(g);                  /* journey.js decides which screen this is */
  ctx.putImageData(img, 0, 0);
}

/* ---------------------------------------------------------------- layout -- */
/* The opening view. Centred on CATALUNYA rather than on the bounding box: the
   box's centre is an empty patch of Nou Barris, because the network reaches
   much further north than it does south. A map should open where the city is.

   Zoom opens just PAST the point where the network is taller than the screen.
   Below that the vertical clamp pins the camera to the middle of the bounding
   box — correct, since there is nothing to pan to — but the box's middle is
   that empty northern patch, so the city sat jammed against the bottom edge
   and centring on Catalunya was silently ignored. Past it the camera is free
   and the opening view is the one asked for. It also clears LABEL_Z, so the
   map opens with its stations named rather than as an anonymous diagram. */
let posed = false;
function home(){
  /* On the player, not on the city centre and not on the bounding box: the
     first thing you should see is where you are standing. */
  const c = STATIONS[J.at] || STATIONS.CATALUNYA;
  cam.x = c ? c.x : (NET_BOX.x0 + NET_BOX.x1) / 2;
  cam.y = c ? c.y : (NET_BOX.y0 + NET_BOX.y1) / 2;
  cam.z = clamp(Math.max(fitZ() * 3, fitY() * 1.15), fitZ(), MAX_Z);
}
function resize(){
  const r = $("screen").getBoundingClientRect();
  /* Round UP so the buffer covers the frame and the upscale stays an exact
     integer — the overflow is clipped, which is invisible, whereas rounding
     down would letterbox or force a fractional scale and soften every edge. */
  const nw = Math.max(40, Math.ceil(r.width  / PX));
  const nh = Math.max(40, Math.ceil(r.height / PX));
  if(nw !== W || nh !== H){
    W = nw; H = nh;
    cv.width = W; cv.height = H;
    cv.style.width = (W * PX) + "px"; cv.style.height = (H * PX) + "px";
    ctx = cv.getContext("2d", {alpha: false});
    ctx.imageSmoothingEnabled = false;
    img = ctx.createImageData(W, H);
    buf = new Uint32Array(img.data.buffer);
  }
  /* POSE ON THE FIRST REAL LAYOUT, not at boot. A frame that has not been laid
     out yet — or is in a hidden tab — reports a zero-height rect, and the 40px
     floor above turns that into a bogus `fitZ`. Posing against it and then
     re-clamping on the next resize silently dumped the opening view back to
     minimum zoom. Wait for a rect that actually exists. */
  if(r.width > 1 && r.height > 1 && !posed){ posed = true; home(); }
  cam.z = clamp(cam.z, fitZ(), MAX_Z);
  clampCam(); dirty = true;
}

/* ----------------------------------------------------------------- input -- */
const pointers = new Map();
let pinch = null, down = null;

/* WHICH STATION WAS TAPPED. Generous, and generous by a SCREEN distance rather
   than a world one — a finger is the same size whatever the zoom. Neighbours
   win ties, so a tap between two dots goes to the one you can actually reach. */
function tapAt(px, py){
  /* MID-RIDE A TAP MEANS SOMETHING ELSE. The map is not interactive during a
     ride, but the things flying past it are — so the tap is routed by phase
     rather than being refused outright. */
  if(J.phase === "RIDING" || J.phase === "ANNOUNCE"){ tapElement(px, py); return; }
  if(busy()) return;
  const g = gauge(cam.z), reach = Math.max(8, g.ri + 6);
  let best = null, bestD = Infinity;
  Object.keys(STATIONS).forEach(id => {
    const s = STATIONS[id];
    const d = Math.hypot(bx(s.x) - px, by(s.y) - py);
    if(d > reach) return;
    if(d < bestD){ bestD = d; best = id; }
  });
  /* EVERY station opens its panel, near or far. Travelling is a button inside
     it (GDD 2), so inspecting and departing are one gesture rather than two
     different meanings for the same tap. */
  if(best) Peek.show(best);
  else Peek.hide();
}

function local(e){
  const r = cv.getBoundingClientRect();
  return {x: (e.clientX - r.left) / PX, y: (e.clientY - r.top) / PX};
}
function snapshot(){
  const [a, b] = [...pointers.values()];
  return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1};
}
function bindInput(){
  const host = $("screen");

  host.addEventListener("pointerdown", e => {
    /* HUD CONTROLS OWN THEIR OWN POINTER. `setPointerCapture` below retargets
       the whole gesture to the screen, so without this guard a press on a
       zoom button never delivers `click` to the button — it was swallowed by
       the pan handler and the buttons did nothing at all. */
    if(e.target.closest(".hudbtn")) return;
    /* the menu covers the map; a press on it is not a press on a station */
    if(Menu.open) return;
    /* and while the camera is leaning, screen coordinates no longer match the
       projection — the panel has the controls */
    if(Lean.on) return;
    /* A RIDE IS A CUTSCENE. Its wipes are anchored to screen positions, so
       letting the map be panned underneath one would tear it apart — but a
       press still has to be TRACKED while riding, or there is nothing to
       recognise a tap on a Track Segment from. */
    if(busy() && !catching()) return;
    /* CAPTURE IS AN OPTIMISATION, NOT A REQUIREMENT. It keeps a drag alive when
       the finger leaves the element — but it THROWS NotFoundError whenever the
       browser has no active pointer with that id, and an uncaught throw here
       takes the whole handler down before a single tap is registered, silently
       killing all input. Never let it be load-bearing. */
    try{ host.setPointerCapture(e.pointerId); }catch(err){ /* drag still works */ }
    const p = local(e);
    pointers.set(e.pointerId, p);
    down = {x: p.x, y: p.y, moved: false};
    cam.tz = null;                             /* a touch cancels an easing zoom */
    if(pointers.size === 2) pinch = snapshot();
    host.classList.add("drag");
  });

  host.addEventListener("pointermove", e => {
    if(!pointers.has(e.pointerId)) return;
    const p = local(e);
    /* A TAP IS A PRESS THAT DID NOT TRAVEL. Without a slop threshold the tiny
       drift of a finger turns every attempt to pan into a station selection. */
    if(down && Math.hypot(p.x - down.x, p.y - down.y) > 2) down.moved = true;
    if(pointers.size === 1 && !busy()){
      const prev = pointers.get(e.pointerId);
      cam.x -= (p.x - prev.x) / cam.z;
      cam.y -= (p.y - prev.y) / cam.z;
      clampCam(); dirty = true;
    }
    pointers.set(e.pointerId, p);
    if(pointers.size === 2 && pinch && !busy()){
      const now = snapshot();
      /* Scale about the midpoint, then carry the midpoint itself — pinching
         on a phone is a zoom AND a pan at the same time. */
      applyZoom(cam.z * (now.d / pinch.d), pinch.x, pinch.y);
      cam.x -= (now.x - pinch.x) / cam.z;
      cam.y -= (now.y - pinch.y) / cam.z;
      clampCam(); dirty = true;
      pinch = now;
    }
  });

  const drop = e => {
    const had = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if(pointers.size < 2) pinch = null;
    if(!pointers.size) host.classList.remove("drag");
    if(had && down && !down.moved && !pointers.size && e.type === "pointerup")
      tapAt(down.x, down.y);
    if(!pointers.size) down = null;
  };
  host.addEventListener("pointerup", drop);
  host.addEventListener("pointercancel", drop);

  host.addEventListener("wheel", e => {
    e.preventDefault();
    if(busy()) return;
    const p = local(e);
    applyZoom(cam.z * Math.exp(-e.deltaY * 0.0016), p.x, p.y);
  }, {passive: false});

  host.addEventListener("dblclick", e => {
    if(busy()) return;
    const p = local(e); zoomTo(cam.z * 1.9, p.x, p.y);
  });

  $("endRide").addEventListener("click", endRide);
  $("menuBtn").addEventListener("click", () => { if(!busy()) Menu.toggle(); });
  $("bagBtn").addEventListener("click", () => Baggage.toggle());

  new ResizeObserver(resize).observe($("screen"));
  bindUiSound();
}

/* ---- ONE LISTENER FOR EVERY BUTTON IN THE APP -----------------------------
   Every control gets a voice from here rather than from its own handler. Two
   reasons: a sound added to a new button is a line in `uiSoundFor` instead of a
   line in whatever wired that button, and nothing can end up playing twice
   because a control both delegated and handled its own noise.

   It is also where audio is UNLOCKED. Browsers refuse to play anything before a
   gesture, so the map's theme cannot start on load — the first press anywhere
   starts whatever the phase says should be playing. Capture phase, so a handler
   that stops propagation cannot silence the interface. */
function bindUiSound(){
  document.addEventListener("pointerdown", e => {
    Music.arm();
    const b = e.target.closest && e.target.closest("button");
    if(!b || b.disabled) return;
    const id = uiSoundFor(b);
    if(id) sfx(id);
  }, true);
}
function uiSoundFor(b){
  /* these speak for themselves elsewhere; a second sound would just muddy it */
  if(b.id === "peekGo" || b.id === "endRide") return null;
  if(b.classList.contains("mtab"))      return "ui_page";
  if(b.classList.contains("mclose") || b.classList.contains("pclose") ||
     b.id === "menuClose" || b.id === "bgClose") return "ui_close";
  if(b.dataset.armor || b.dataset.openset || b.dataset.setpick) return "ui_equip";
  if(b.dataset.pick || b.classList.contains("chgbtn") ||
     b.id === "menuBtn" || b.id === "bagBtn") return "ui_open";
  if(b.dataset.sort) return "ui_page";
  return "ui_tap";
}
/* ONE file input for the whole app — creation and the SAVE tab both click it.
   A second one would be a second place for the accept list to go stale. */
function bindSaveFile(){
  const inp = $("saveFile"); if(!inp) return;
  inp.addEventListener("change", () => {
    const f = inp.files && inp.files[0];
    inp.value = "";                       /* so the same file can be picked twice */
    Vault.importFile(f, r => {
      if(!r.ok){
        if(Create.open){ Create.note = r.why; Create.render(); }
        else Menu.say(r.why);
        return;
      }
      if(Create.open) Create.hide();
      Menu.hide();
      enterNetwork(r.interrupted);
    });
  });
}
/* Put the map where the player now is. Called at boot and after any load — a
   restored save can be at a completely different station, and the marker, the
   camera and the HUD all have to follow it rather than the one we left. */
function enterNetwork(interrupted, atBoot){
  if(interrupted) resolveInterrupted(interrupted);
  J.at = Player.at; J.to = null; J.phase = "IDLE"; J.f = 0;
  J.markX = STATIONS[J.at].x; J.markY = STATIONS[J.at].y;
  if(!atBoot){ posed = false; resize(); }   /* re-centre on the new station */
  syncHud();
  dirty = true;
}

/* ------------------------------------------------------------------ boot -- */
let lastFrameAt = 0;
function pump(now){
  now = now === undefined ? performance.now() : now;
  /* THE ELEMENTS MOVE ON THIS CLOCK, not the 12 fps one — they have to be
     catchable with a thumb. Everything else still steps. See elements.js. */
  const dt = lastFrameAt ? now - lastFrameAt : 16;
  lastFrameAt = now;
  if(J.phase === "RIDING" || J.phase === "ANNOUNCE"){
    stepElementsSmooth(dt);
    dirty = true;
  }
  if(cam.tz !== null){
    const step = cam.z + (cam.tz - cam.z) * 0.35;
    const done = Math.abs(cam.tz - cam.z) < 0.004;
    applyZoom(done ? cam.tz : step, cam.ax, cam.ay);
    if(done) cam.tz = null;
  }
  if(now - lastStep >= STEP_MS){          /* the 12 fps game clock */
    lastStep = now; frame++;
    rampStep();
    leanStep();
    journeyStep();                        /* the whole ride runs on this clock */
    if(liveStates || J.phase === "IDLE") dirty = true;
  }
  if(dirty){ dirty = false; draw(); }
}
/* THE RAMP SCROLLS ON THE GAME CLOCK, not on a CSS animation. Everything else
   in this project steps at 12 fps; a smoothly sliding gradient beside stepped
   art is instantly the wrong medium. One custom property, read by every element
   wearing `.ramp`. */
/* ---- THE CAMERA LEANS WHEN YOU PICK A DESTINATION ------------------------
   Choosing where to go is the one moment the map stops being a diagram and
   becomes a place, so it tips: a hard lean to one side, then a slow breathing
   drift in the tilt and the zoom so the frame never sits still while the
   decision is open.

   It is a CSS transform on the canvas, NOT a change to the projection — the
   rasteriser, the label placement and the wipes all keep working in screen
   space and know nothing about it. The cost of that is that tap coordinates no
   longer line up, so map taps are refused while the lean is on; the panel
   holding the decision has the only controls that matter anyway. */
const Lean = {on: false, side: 1, t: 0, deg: 0, zoom: 1};
function leanTo(side){
  Lean.on = true; Lean.side = side; Lean.t = 0;
}
function leanOff(){
  if(!Lean.on) return;
  Lean.on = false;
  if(cv) cv.style.transform = "translate(-50%,-50%)";
}
function leanStep(){
  if(!cv) return;
  if(!Lean.on) return;
  Lean.t += 1;
  /* two loops at different rates, so the drift never repeats obviously */
  const sway = Math.sin(Lean.t * 0.055) * 3.4 + Math.sin(Lean.t * 0.021) * 1.6;
  Lean.deg = Lean.side * (20 + sway);
  Lean.zoom = 1.06 + Math.sin(Lean.t * 0.037) * 0.035;
  cv.style.transform = "translate(-50%,-50%) rotate(" + Lean.deg.toFixed(2) +
                       "deg) scale(" + Lean.zoom.toFixed(3) + ")";
}

let rampX = 0;
function rampStep(){
  rampX = (rampX - 2) % 4096;
  document.documentElement.style.setProperty("--rampPos", rampX.toFixed(1) + "px");
}
function tick(now){ pump(now); requestAnimationFrame(tick); }

function boot(){
  cv = $("map");
  /* GDD 6 — a trip still recorded as in the air means the browser was closed
     mid-ride, which counts as a defeat. Resolved BEFORE the first layout, so
     the opening view is centred on where the player actually ends up. */
  const lost = resolveInterrupted(Player.load());
  if(lost) console.log("interrupted trip resolved as a defeat:", lost);
  enterNetwork(null, true);

  resize();
  const n = applyDemoStates();
  liveStates = StationFx.anyLive();
  if(n) console.log("states=demo:", n, "stations given reference states");
  syncHud();
  bindInput();
  bindSaveFile();
  tick();
  /* Nobody plays until they are someone. Creation covers the map rather than
     replacing it, so the world is already drawn and warm behind it. */
  if(Create.needed()) Create.show("START");
  /* A backgrounded tab throttles rAF to nothing, which would strand any
     running animation. The same watchdog the battle system uses. */
  setInterval(() => pump(), STEP_MS);
}
addEventListener("DOMContentLoaded", boot);
