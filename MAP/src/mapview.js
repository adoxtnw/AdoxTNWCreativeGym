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
/* ---- THE BUFFER IS BIGGER THAN THE FRAME -----------------------------------
   W and H stay what they have always been: the size of the VISIBLE frame, in
   art pixels. Everything that lays anything out — the trip bar, the train, a
   label deciding whether it fits — still measures against those and is
   untouched by any of this.

   What changed is that the buffer now carries a MARGIN of MX by MY around that
   frame, and the canvas element is drawn that much larger and centred, so the
   margin hangs off all four sides and is clipped away. It exists for one
   reason: when the map leans (see Lean), the rotated rectangle no longer covers
   the frame, and the corners that swing inward were showing the void beyond the
   map. Scaling the canvas up to cover would have worked too, but that zooms the
   art; rendering MORE MAP costs a few thousand pixels and keeps the framing and
   the pixel scale exactly as they were.

   Because the projection puts world (cam.x, cam.y) at the buffer's CENTRE, and
   the margin is symmetric, adding it moves nothing — it only reveals more.   */
let MX = 0, MY = 0;                 /* margin each side, in art pixels */
let BW = 0, BH = 0;                 /* the buffer's real size, W+2MX by H+2MY */
const bufI = (x, y) => (y + MY) * BW + (x + MX);
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
  if(x < -MX || y < -MY || x >= W + MX || y >= H + MY) return;
  if(clipC){ const dx = x - clipC.x, dy = y - clipC.y; if(dx*dx + dy*dy > clipC.r2) return; }
  buf[(y + MY) * BW + (x + MX)] = col;
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
    if(y < -MY || y >= H + MY) continue;
    const half = Math.floor(Math.sqrt(Math.max(0, clipC.r2 - dy * dy)));
    const x0 = Math.max(-MX, clipC.x - half), x1 = Math.min(W + MX - 1, clipC.x + half);
    for(let x = x0; x <= x1; x++) buf[(y + MY) * BW + (x + MX)] = col;
  }
}
/* EVERYTHING ON SCREEN, PULLED TOWARD ONE COLOUR. Written straight into the
   typed array rather than through blendPx: it touches every pixel in the
   buffer, and a function call per pixel is the difference between a free
   operation and a visible one. It covers the MARGIN too — the lean can be on
   while this runs, and a washed frame with an unwashed border would be worse
   than no wash at all. */
function washScene(col, a){
  if(a <= 0) return;
  if(a > 1) a = 1;
  const r = col[0], g = col[1], b = col[2], n = buf.length;
  for(let i = 0; i < n; i++){
    const p = buf[i], pr = p & 255, pg = (p >> 8) & 255, pb = (p >> 16) & 255;
    buf[i] = (255 << 24) | (((pb + (b - pb) * a) | 0) << 16)
                         | (((pg + (g - pg) * a) | 0) <<  8)
                         |  ((pr + (r - pr) * a) | 0);
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
  for(let wy = y0; by(wy) < H + MY + step; wy += step)
    for(let wx = x0; bx(wx) < W + MX + step; wx += step) plot(bx(wx), by(wy), g);
}
function drawLines(w){
  LINES.forEach(l => {
    const col = packRGB(lineRGB(l)), p = l._path;
    for(let i = 0; i < p.length - 1; i++){
      const ax = bx(p[i][0]), ay = by(p[i][1]);
      const bx2 = bx(p[i + 1][0]), by2 = by(p[i + 1][1]);
      /* whole segment off-screen: skip before rasterising hundreds of pixels */
      if((ax < -MX - 20 && bx2 < -MX - 20) || (ax > W + MX + 20 && bx2 > W + MX + 20) ||
         (ay < -MY - 20 && by2 < -MY - 20) || (ay > H + MY + 20 && by2 > H + MY + 20)) continue;
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
    if(x < -MX - r - 6 || y < -MY - r - 6 || x > W + MX + r + 6 || y > H + MY + r + 6) return;

    const base = hub ? INK : lineRGB(LINES_AT[id][0]);
    /* The brush is a shared singleton, so making one unconditionally costs
       nothing and means a city status can paint at a station whose `state` is
       blank — which is almost all of them. */
    const b = brushAt(x, y, r, base);
    const fx = StationFx.of(s.state);
    paintCityStatus(s, b);                 /* the city, before the place */
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
      if(x < -MX - 20 || y < -MY - 20 || x > W + MX + 20 || y > H + MY + 20) return;
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
    if(s._bx < -MX - 90 || s._by < -MY - 20 || s._bx > W + MX + 90 || s._by > H + MY + 20) return;
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
    if(box.x0 < -MX || box.x1 > W + MX || box.y0 < -MY || box.y1 > H + MY) return;
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
   travelling ring gets, AND the name plate above it. All of that is painted
   last and so paints OVER any name that was placed there, which had PASSENGER
   stamped across CAMP DE L'ARPA. Reserving it is what keeps the surrounding
   labels out of the way. */
function markerBox(g){
  const x = bx(J.markX) | 0, y = by(J.markY) | 0;
  const r = (isInterchange(J.at) ? g.ri : g.r) + 1 + 5;
  const tag = textW(foldText(Player.name || "")) + 4;   /* + the plate's air */
  const half = Math.max(r, (tag >> 1) + 5);   /* a real gap, not a shave */
  /* the arrow sits ~8 above the dot and the stack climbs three rows from there */
  const top = y - r - 8 - (FONT_H + 3) - 2;
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
    if(x < -MX - r - 6 || y < -MY - r - 6 || x > W + MX + r + 6 || y > H + MY + r + 6) return;
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
/* ---- THE CAMERA TRAVELS TO A STATION, IT DOES NOT CUT TO IT ---------------
   Choosing a destination used to assign cam.x/y/z outright, so the map arrived
   somewhere else between one frame and the next and the player had to re-find
   themselves. Eased, the movement itself says "this is where you were, and this
   is the thing you just picked" — which is the only moment on the map where
   those two facts need relating.

   It runs on the DISPLAY's clock, like the lean and the travel elements: a pan
   stepped twelve times a second is a stutter. Position and zoom share one
   curve, so the two never finish at different moments and leave the frame
   drifting after it has apparently arrived. */
let camTw = null;
function camTo(x, y, z, ms){
  cam.tz = null;                            /* the pinch easing must not fight it */
  camTw = {x0: cam.x, y0: cam.y, z0: cam.z,
           x1: x, y1: y, z1: clamp(z, fitZ(), MAX_Z),
           t: 0, dur: Math.max(60, ms || num(RULES.camEaseMs, 620))};
}
function camCancel(){ camTw = null; }
function camTweenStep(dt){
  if(!camTw) return;
  camTw.t = Math.min(camTw.dur, camTw.t + dt);
  const k = ease(camTw.t / camTw.dur);
  cam.x = lerp(camTw.x0, camTw.x1, k);
  cam.y = lerp(camTw.y0, camTw.y1, k);
  cam.z = lerp(camTw.z0, camTw.z1, k);
  clampCam();
  dirty = true;
  if(camTw.t >= camTw.dur) camTw = null;
}
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
  /* HOW MUCH MARGIN A LEAN NEEDS. A w-by-h frame turned by t only stays covered
     if the source is (w·cos + h·sin) by (w·sin + h·cos) — for a tall frame at
     20 degrees that is most of another half-width. Worked out from the lean's
     own angle plus its sway, so raising leanDeg in the sheet widens the buffer
     rather than putting the void back. */
  const rad = (num(RULES.leanDeg, 20) + 6) * Math.PI / 180;
  const c = Math.abs(Math.cos(rad)), sn = Math.abs(Math.sin(rad));
  const mx = Math.ceil((nw * c + nh * sn - nw) / 2);
  const my = Math.ceil((nw * sn + nh * c - nh) / 2);
  if(nw !== W || nh !== H || mx !== MX || my !== MY){
    W = nw; H = nh; MX = mx; MY = my;
    BW = W + MX * 2; BH = H + MY * 2;
    cv.width = BW; cv.height = BH;
    cv.style.width = (BW * PX) + "px"; cv.style.height = (BH * PX) + "px";
    ctx = cv.getContext("2d", {alpha: false});
    ctx.imageSmoothingEnabled = false;
    img = ctx.createImageData(BW, BH);
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
  /* The canvas is larger than the frame by the lean margin and centred on it,
     so its top-left is MX,MY OUTSIDE the frame — take that back off, or every
     tap lands up and to the left of where the finger actually was. */
  const r = cv.getBoundingClientRect();
  return {x: (e.clientX - r.left) / PX - MX, y: (e.clientY - r.top) / PX - MY};
}
function snapshot(){
  const [a, b] = [...pointers.values()];
  return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1};
}
/* IS SOMETHING IN FRONT OF THE MAP? One predicate rather than three copies of
   the same list, because the copies are what let `wheel` and `dblclick` fall
   out of step with `pointerdown` in the first place. */
function blocked(){
  return busy() || Menu.open || Baggage.open || Create.open || Peek.open ||
         $("tip").classList.contains("on");
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
       projection — the panel has the controls. Held through the ease OUT too,
       or a tap during the settle lands somewhere the map never was. */
    if(Lean.on || Lean.k > 0.02) return;
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
    camCancel();                               /* and an easing pan: the hand wins */
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

  /* EVERY GESTURE ASKS, NOT JUST THE FIRST ONE. These listeners sit on
     `#screen`, which is an ANCESTOR of the menu — so an event that lands on a
     panel still bubbles down here, and `pointer-events:auto` on the panel does
     nothing to stop it. `pointerdown` was guarded and these two were not, which
     is why the map could still be zoomed by scrolling or double-tapping over an
     open menu. Anything added here needs the same guard. */
  host.addEventListener("wheel", e => {
    e.preventDefault();
    if(blocked()) return;
    const p = local(e);
    applyZoom(cam.z * Math.exp(-e.deltaY * 0.0016), p.x, p.y);
  }, {passive: false});

  host.addEventListener("dblclick", e => {
    if(blocked()) return;
    const p = local(e); zoomTo(cam.z * 1.9, p.x, p.y);
  });

  $("endRide").addEventListener("click", endRide);
  $("menuBtn").addEventListener("click", () => { if(!busy()) Menu.toggle(); });
  $("bagBtn").addEventListener("click", () => Baggage.toggle());

  /* One listener for the whole screen: any press that is not on the bubble
     closes it. preventDefault so the press does not also fall through to the
     map underneath and move the camera. */
  const veil = $("tipVeil");
  if(veil) veil.addEventListener("pointerdown", e => { e.preventDefault(); hideTip(); });

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
  /* THE SAME BROADENING THE BATTLE SIDE NEEDED. Safari does not treat every
     gesture as an unlock, and which one counts is not worth being clever
     about — these are listeners that do nothing once the music is running. */
  ["touchstart", "click", "keydown"].forEach(t =>
    document.addEventListener(t, () => Music.arm(), true));
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
  leanStep();                             /* the tilt is a camera move: 60 fps */
  camTweenStep(dt);
  if(cam.tz !== null){
    const step = cam.z + (cam.tz - cam.z) * 0.35;
    const done = Math.abs(cam.tz - cam.z) < 0.004;
    applyZoom(done ? cam.tz : step, cam.ax, cam.ay);
    if(done) cam.tz = null;
  }
  if(now - lastStep >= STEP_MS){          /* the 12 fps game clock */
    lastStep = now; frame++;
    rampStep();
    /* THE HOUR CHANGES WITHOUT ANYONE PRESSING ANYTHING. Every five seconds is
       often enough to catch a rollover that matters and rare enough to cost
       nothing; CityBar.render() itself no-ops unless something changed. */
    if((frame % 60) === 0) CityBar.render();
    MenuGauge.step();                   /* the card's bar, only while it is up */
    RideGauge.step();                   /* and the ride's, only while riding */
    journeyStep();                        /* the whole ride runs on this clock */
    if(liveStates || cityLive() || J.phase === "IDLE") dirty = true;
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
const Lean = {on: false, side: 1, t: 0, k: 0, deg: 0, zoom: 1, last: 0};
function leanTo(side){
  /* keep `t` running across a re-target: the drift should carry on rather than
     snap back to the top of its cycle when the player picks another station */
  if(!Lean.on) Lean.t = 0;
  Lean.on = true; Lean.side = side;
}
function leanOff(){ Lean.on = false; }        /* eases out; see leanStep */

/* THE TILT ARRIVES AND LEAVES, IT DOES NOT APPEAR.

   `k` is how far into the lean we are, 0 to 1, and EVERYTHING the lean does is
   multiplied by it — the angle, the extra zoom, the drift. So one eased number
   carries the whole pose in and back out, and the sway is already at its right
   phase when it gets there instead of starting from nothing.

   It keeps stepping while k is on its way back down, which is why leanOff only
   clears the flag: the transform is dropped at the far end, once there is
   genuinely nothing left to draw. */
function leanStep(){
  if(!cv) return;
  const now = performance.now();
  const dt = Lean.last ? Math.min(120, now - Lean.last) : 16;
  Lean.last = now;
  const rate = dt / Math.max(60, num(RULES.leanEaseMs, 520));
  const kWant = Lean.on ? 1 : 0;
  if(Lean.k === kWant && !Lean.on) return;      /* settled, and nothing to draw */
  Lean.k = Lean.on ? Math.min(1, Lean.k + rate) : Math.max(0, Lean.k - rate);
  const e = ease(Lean.k);                       /* smoothstep, both directions */

  Lean.t += dt / 83;                            /* the drift, in 12 fps frames */
  /* two loops at different rates, so the drift never repeats obviously */
  const sway = Math.sin(Lean.t * 0.055) * 3.4 + Math.sin(Lean.t * 0.021) * 1.6;
  Lean.deg  = Lean.side * (num(RULES.leanDeg, 20) + sway) * e;
  Lean.zoom = 1 + (0.06 + Math.sin(Lean.t * 0.037) * 0.035) * e;
  if(Lean.k <= 0){ cv.style.transform = "translate(-50%,-50%)"; return; }
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
  const forced = applyStatusSwitch();
  if(forced) console.log("status=" + forced + ":",
    CityStatus.active().length + " city status forced on");
  syncHud();
  bindInput();
  bindSaveFile();
  tick();
  /* THE MAP'S THEME STARTS ON ARRIVAL, not on the first tap. `syncHud()` above
     has already decided what should be playing, so this only has to ask for
     it; if the browser refuses, `apply()` disarms and the first touch retries. */
  Music.tryNow();
  enterFromTitle();
  /* Nobody plays until they are someone — but they usually already are: the
     title screen asks first-timers on the way in, and this claims that answer
     before the question can be asked a second time. Creation stays as the
     fallback for anyone who reaches the map without having been asked. */
  Player.claimNewPassenger();
  if(Create.needed()) Create.show("START");
  /* A backgrounded tab throttles rAF to nothing, which would strand any
     running animation. The same watchdog the battle system uses. */
  setInterval(() => pump(), STEP_MS);
}
addEventListener("DOMContentLoaded", boot);

/* ---- ARRIVING FROM THE TITLE SCREEN ----------------------------------------
   The other app fades its content out and leaves the screen plain black, then
   sends us here with `?enter=1`. We start black too and open the SAME circular
   wipe it uses for its own reveals — so a page load in the middle of a
   transition is invisible: both halves meet on the same colour, and what the
   hole opens onto is the city.

   The blackout is a DOM layer rather than a full canvas, because the map needs
   a laid-out frame before it can draw anything and the black has to be there
   before that. The wipe canvas is opaque everywhere outside its circle, so the
   two overlap for a frame and the handover is never seen.

   Nothing new is drawn here: `battleWipeReveal()` is the curtain already ported
   for the battle handoff, and the reason it is worth having in one place. */
function enterFromTitle(){
  if(!/(?:\?|&)enter=1/.test(location.search)) return;
  const veil = $("battleFlash");
  if(veil) veil.classList.add("blackout");
  /* one frame for the map to lay out and pose itself, or the wipe opens onto
     a view that has not decided where it is looking yet */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    battleWipeReveal(num(RULES.enterWipeMs, 1100)).then(() => {
      if(veil) veil.classList.remove("blackout");
    });
    /* dropped as soon as the curtain is up and carrying the black itself */
    setTimeout(() => { if(veil) veil.classList.remove("blackout"); }, 90);
  }));
}
