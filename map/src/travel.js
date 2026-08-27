"use strict";
/* NEURO-METRO: AVUI — MAP — the travel screen
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   Neuro-Metro does not run through tunnels. It runs through EMOTIONAL SPACE,
   so what is behind the train is not a wall but three parallax depths of the
   emotion of the line being ridden — and every one of them is coloured from
   that line's emotion, never from a palette of its own.

     far    a single circular gradient, larger than the screen, barely moving
     mid    a repeating motif belonging to the emotion (Anger is fire)
     near   dust, drifting fastest because it is closest to the camera

   The track is vertical and the train always runs UP the screen, so every
   layer scrolls DOWNWARD; the faster a layer scrolls, the nearer it reads.

   Drawn into the same low-resolution buffer as the map, by the same hand-
   rolled rasteriser, so the two screens are made of the same pixels and the
   wipe between them can simply be a clip.                                   */

const TRAIN_W    = 34;     /* FIXED, not a fraction of the screen — roughly a
                              quarter of the buffer's width, which leaves the
                              empty space either side that sells the scale */
const TRAIN_NOSE = 0.50;   /* the lead car's front, as a fraction of height */
const CAR_H      = 42, CAR_GAP = 5, CARS = 3;
const RAIL_DX    = 10;     /* rails sit inside the train's footprint */
const SLEEPER    = 15;     /* one sleeper every this many world units */

const trainCX = () => W >> 1;
const noseY   = () => Math.round(H * TRAIN_NOSE);

/* ---- one pixel, mixed into what is already there ------------------------ */
/* The buffer is opaque, so "fading in" has to mean blending toward whatever
   was drawn underneath rather than carrying an alpha channel around. */
function blendPx(x, y, c, a){
  x |= 0; y |= 0;
  if(x < -MX || y < -MY || x >= W + MX || y >= H + MY || a <= 0) return;
  if(clipC){ const dx = x - clipC.x, dy = y - clipC.y; if(dx*dx + dy*dy > clipC.r2) return; }
  const i = bufI(x, y), p = buf[i];
  const r = p & 255, g = (p >> 8) & 255, b = (p >> 16) & 255;
  /* CLAMP, DO NOT MASK. `mix(col, 1.45)` deliberately overdrives a colour past
     white to make a thing stand out against a field of its own hue, which puts
     a channel over 255. Masking with & 0xff WRAPS that — anger's red went 332,
     came back 76, and Track Segments on the red line rendered blue. */
  buf[i] = (255 << 24) | (c255(b + (c[2] - b) * a) << 16)
                       | (c255(g + (c[1] - g) * a) << 8)
                       |  c255(r + (c[0] - r) * a);
}
const c255 = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
const mix = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

/* ======================= FAR: the emotional field ========================= */
/* One circular gradient, wider than the screen, drifting slowly. It is not a
   clean circle: the radius is perturbed by angle and time, which is what makes
   the space read as unstable rather than as a vignette. */
function drawFar(col, off){
  const cx = W / 2, cy = H * 0.40 - (off % (H * 2));
  const R = Math.max(W, H) * 1.15, t = frame * 0.06;
  for(let y = 0; y < H; y++){
    const dy = y - cy;
    for(let x = 0; x < W; x++){
      const dx = x - cx;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = Math.atan2(dy, dx);
      const wob = 1 + 0.10 * Math.sin(a * 3 + t) + 0.06 * Math.sin(a * 5 - t * 0.7);
      const k = 1 - d / (R * wob);
      if(k <= 0) continue;
      blendPx(x, y, col, k * k * 0.30);
    }
  }
}

/* ======================= MID: the emotion's motif ========================= */
/* A registry, the same shape as StationFx: keyed by emotion, with a fallback,
   so a new emotion degrades to something plain instead of throwing. Each motif
   is drawn on a scrolling staggered grid. */
const EmotionField = {
  _reg: Object.create(null),
  define(id, spec){ this._reg[id] = spec; return spec; },
  of(id){ return this._reg[id] || this._reg._default; }
};
function motifGrid(off, cw, ch, fn){
  const cols = Math.ceil(W / cw) + 2, rows = Math.ceil(H / ch) + 2;
  const shift = ((off % ch) + ch) % ch;
  for(let r = -1; r < rows; r++)
    for(let c = -1; c < cols; c++)
      fn(Math.round(c * cw + ((r & 1) ? cw / 2 : 0)), Math.round(r * ch + shift), r, c);
}
const cellRnd = (r, c, s) => {
  let h = ((r * 73856093) ^ (c * 19349663) ^ (s * 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

/* ANGER — fire: tongues that taper upward and lick sideways with the clock */
EmotionField.define("ANGER", {cw: 36, ch: 42, draw(x, y, r, c, col){
  const h = 15 + cellRnd(r, c, 1) * 11, ph = cellRnd(r, c, 2) * 6.3;
  for(let i = 0; i < h; i++){
    const k = i / h;
    /* the tongue LEANS more the higher it gets, which is what separates a
       flame from a cone — a uniform wobble just slides the whole shape */
    const lean = Math.sin(frame * 0.30 + ph + k * 3.1) * (3.4 * k * k);
    const half = Math.max(0, (1 - k * k) * 3.0);
    for(let dx = -half; dx <= half; dx++){
      const edge = Math.abs(dx) / (half + 0.001);
      blendPx(x + dx + lean, y - i, col, 0.13 * (1 - k * 0.5) * (1 - edge * 0.55));
    }
  }
}});
/* SURPRISE — a burst: spikes thrown out from nothing */
EmotionField.define("SURPRISE", {cw: 34, ch: 36, draw(x, y, r, c, col){
  const n = 6, ph = cellRnd(r, c, 3) * 6.3;
  const len = 5 + 3 * (0.5 + 0.5 * Math.sin(frame * 0.28 + ph));
  for(let s = 0; s < n; s++){
    const a = ph + s * (6.283 / n);
    for(let i = 2; i < len; i++)
      blendPx(x + Math.cos(a) * i, y + Math.sin(a) * i, col, 0.20 * (1 - i / len));
  }
}});
/* DISGUST — bubbles rising and swelling */
EmotionField.define("DISGUST", {cw: 26, ch: 30, draw(x, y, r, c, col){
  const ph = cellRnd(r, c, 4) * 6.3;
  const rad = 3 + 2.2 * (0.5 + 0.5 * Math.sin(frame * 0.22 + ph));
  for(let a = 0; a < 6.283; a += 0.35)
    blendPx(x + Math.cos(a) * rad, y + Math.sin(a) * rad, col, 0.20);
}});
/* JOY — sparkles: four-point stars that pulse */
EmotionField.define("JOY", {cw: 28, ch: 30, draw(x, y, r, c, col){
  const ph = cellRnd(r, c, 5) * 6.3;
  const len = 2 + 4 * (0.5 + 0.5 * Math.sin(frame * 0.36 + ph));
  for(let i = -len; i <= len; i++){
    const f = 0.22 * (1 - Math.abs(i) / (len + 1));
    blendPx(x + i, y, col, f); blendPx(x, y + i, col, f);
  }
}});
/* SADNESS — rain: streaks falling at their own speeds */
EmotionField.define("SADNESS", {cw: 18, ch: 26, draw(x, y, r, c, col){
  const len = 5 + cellRnd(r, c, 6) * 8;
  for(let i = 0; i < len; i++) blendPx(x, y + i, col, 0.20 * (1 - i / len));
}});
/* FEAR — something watching: a lens that narrows and widens */
EmotionField.define("FEAR", {cw: 32, ch: 34, draw(x, y, r, c, col){
  const ph = cellRnd(r, c, 7) * 6.3;
  const open = 1.6 + 2.2 * (0.5 + 0.5 * Math.sin(frame * 0.19 + ph));
  for(let dx = -6; dx <= 6; dx++){
    const k = 1 - Math.abs(dx) / 6, h = Math.round(open * k);
    blendPx(x + dx, y - h, col, 0.20); blendPx(x + dx, y + h, col, 0.20);
  }
  blendPx(x, y, col, 0.34);
}});
EmotionField.define("_default", {cw: 26, ch: 28, draw(x, y, r, c, col){
  blendPx(x, y, col, 0.20);
}});

function drawField(emotion, col, off){
  const f = EmotionField.of(emotion), tint = mix(col, 0.85);
  motifGrid(off, f.cw, f.ch, (x, y, r, c) => f.draw(x, y, r, c, tint));
}

/* ======================= NEAR: dust ====================================== */
/* Each mote carries its own depth, so the nearest drift visibly faster than
   the furthest even within this one layer. */
const DUST_N = 54;
function drawDust(col, off){
  const bright = mix(col, 1.25);
  for(let i = 0; i < DUST_N; i++){
    const rx = cellRnd(i, 11, 1), ry = cellRnd(i, 22, 2), depth = 0.55 + rx * 0.9;
    const x = Math.round(rx * W);
    const y = (((ry * H + off * depth) % (H + 10)) + H + 10) % (H + 10) - 5;
    const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(frame * 0.5 + i));
    blendPx(x, y, bright, 0.5 * tw);
    if(depth > 1.1) blendPx(x, y + 1, bright, 0.28 * tw);   /* the nearest streak */
  }
}

/* ======================= the track and the train ========================== */
function drawTrack(col, off){
  /* Heavier and brighter than a real track would be. At three screen pixels
     per art pixel, and under a displacement filter, a faint two-pixel rail
     reads as a smudge rather than as something the train is running on. */
  const cx = trainCX(), rail = mix(col, 0.95), sleeper = mix(col, 0.60);
  const shift = ((off % SLEEPER) + SLEEPER) % SLEEPER;
  for(let y = -SLEEPER; y < H + SLEEPER; y += SLEEPER){
    const sy = Math.round(y + shift);
    for(let dx = -RAIL_DX - 6; dx <= RAIL_DX + 6; dx++){
      blendPx(cx + dx, sy,     sleeper, 0.85);
      blendPx(cx + dx, sy + 1, sleeper, 0.60);
    }
  }
  for(let y = 0; y < H; y++)
    for(const side of [-1, 1]){
      const rx = cx + side * RAIL_DX;
      blendPx(rx,     y, rail, 0.95);
      blendPx(rx - 1, y, rail, 0.80);
      blendPx(rx + 1, y, rail, 0.55);
    }
}
/* PLACEHOLDER ROLLING STOCK. A real top-down train arrives as SVG later; this
   is deliberately plain so it is obvious it is not the art. */
function drawTrain(col, dy){
  const cx = trainCX(), x0 = cx - (TRAIN_W >> 1), top = noseY() + (dy || 0);
  const body = [214, 209, 200], edge = [26, 23, 20], glass = mix(col, 1.1);
  for(let i = 0; i < CARS; i++){
    const y0 = top + i * (CAR_H + CAR_GAP);
    if(y0 > H || y0 + CAR_H < 0) continue;
    rect(x0, y0, TRAIN_W, CAR_H, packRGB(body));
    /* outline */
    for(let x = 0; x < TRAIN_W; x++){ plot(x0 + x, y0, packRGB(edge)); plot(x0 + x, y0 + CAR_H - 1, packRGB(edge)); }
    for(let y = 0; y < CAR_H; y++){ plot(x0, y0 + y, packRGB(edge)); plot(x0 + TRAIN_W - 1, y0 + y, packRGB(edge)); }
    /* windows down both flanks, and a lit cab on the lead car */
    for(let y = 6; y < CAR_H - 6; y += 7){
      rect(x0 + 2, y0 + y, 3, 4, packRGB(glass));
      rect(x0 + TRAIN_W - 5, y0 + y, 3, 4, packRGB(glass));
    }
    if(i === 0) rect(x0 + 6, y0 + 3, TRAIN_W - 12, 4, packRGB(glass));
  }
}

/* The whole scene, back to front. `J` is the journey (see journey.js). */
function drawTravelScene(J){
  const col = lineRGB(J.line);
  fillScene(packRGB([10, 8, 12]));
  drawFar(col,   J.dist * 0.05);
  drawField(J.line.emotion, col, J.dist * 0.20);
  drawDust(col,  J.dist * 0.55);
  drawTrack(col, J.dist);
  drawTrain(col, J.trainDY);
}
