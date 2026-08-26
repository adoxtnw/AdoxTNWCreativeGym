"use strict";
/* NEURO-METRO: AVUI — MAP — what rides along with you
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   Things appear around the train during a ride. WHAT may appear, how likely it
   is, how many may exist at once, how many a single ride may ever produce and
   how long each lasts are all rows in the `travel_elements` sheet — none of it
   is in this file. What is here is the machinery: rolling, spawning, ageing,
   culling, and the two behaviours a tap can have.

   RATES ARE A PRODUCT, NOT A CONSTANT:

       chance  =  sheet base  x  target station  x  temporary modifiers

   The base is the element's own row. The station is the one you are travelling
   TO — its `spawn` column, because what you are about to arrive at is what
   colours the approach. And temporary modifiers are the seam for weather and
   time of day: `TravelMods` is wired and empty, so those can be added later
   without touching anything here.

   NOTHING HERE OWNS A TIMER OR A LISTENER. Every element is a plain object in
   one array, drawn from that array and spliced out of it when it expires. That
   is deliberate: an element that registered its own `setTimeout` or its own
   DOM node would leak one per spawn, and a ride can produce dozens. The only
   lifetime is `age` against `life`, both counted in clock frames.            */

/* ---- temporary modifiers: weather, time of day, whatever comes ----------- */
const TravelMods = {
  _list: [],                       /* {tag, mods:{ELEMENT_ID: multiplier}, until} */
  add(tag, mods, secs){
    this._list.push({tag, mods, until: frame + Math.round((secs || 0) * 12)});
  },
  drop(tag){ this._list = this._list.filter(m => m.tag !== tag); },
  clear(){ this._list.length = 0; },
  prune(){ this._list = this._list.filter(m => m.until > frame); },
  factor(id){
    let f = 1;
    this._list.forEach(m => { if(m.mods[id] != null) f *= m.mods[id]; });
    return f;
  }
};
/* The target station's own multipliers, parsed from `spawn`: "SEGMENT:1.4|ENTITY:0.5" */
function stationFactor(stationId, elementId){
  const s = STATIONS[stationId]; if(!s || !s.spawn || !s.spawn.length) return 1;
  for(let i = 0; i < s.spawn.length; i++){
    const bits = String(s.spawn[i]).split(":");
    if(bits[0].trim().toUpperCase() === elementId){
      const v = parseFloat(bits[1]);
      return isNaN(v) ? 1 : v;
    }
  }
  return 1;
}
const chanceOf = e =>
  e.chance * stationFactor(J.to, e.id) * TravelMods.factor(e.id);

/* ---- the ride's element state -------------------------------------------- */
const Trip = {
  live: [],          /* every element currently in the world */
  queue: [],         /* {id, at} — spawns rolled for but not yet emitted */
  made: {},          /* how many of each this ride has produced, ever */
  collected: 0,
  target: 10,
  nextRoll: 0
};
/* GDD 4: the roll comes round every 1-3 seconds, and enemy density squeezes it
   toward the fast end — so a dangerous stretch is busier as well as nastier.
   Re-rolled each time rather than fixed, or the track would tick like a metronome. */
const ROLL_FRAMES = () => Math.max(1, Math.round(rollSecondsFor(J.to) * 12));
/* Lifetimes are MILLISECONDS, not clock frames, because elements now move on
   the display's clock rather than the game's — see stepElementsSmooth. */
const secsToMs = s => Math.max(80, Math.round(s * 1000));
const STEP = 83;                    /* one 12 fps frame, in ms */
/* 0 in the sheet means UNLIMITED. A per-trip cap on Track Segments would mean a
   long ride simply stops producing the thing the ride is about. */
const capOf = v => (num(v, 0) <= 0 ? Infinity : num(v, 0));

/* Called at the top of every ride. Emptying the arrays IS the destruction —
   there is nothing else holding a reference to an element. */
function resetTrip(){
  Trip.live.length = 0;
  Trip.queue.length = 0;
  Trip.made = {};
  Trip.collected = 0;
  Trip.target = Math.max(1, RULES.travelTarget || 10);
  Trip.nextRoll = 0;
  TravelMods.prune();
}
const liveCount = id => {
  let n = 0;
  for(let i = 0; i < Trip.live.length; i++) if(Trip.live[i].id === id) n++;
  return n;
};

/* ---- rolling ------------------------------------------------------------- */
/* Every `travelRollSecs` each element type is offered every FREE SLOT it has,
   and each slot is rolled independently against the resolved chance. Rolling
   once per type instead would make a cap of fifteen unreachable — at one
   success per three seconds against a life of one to three, there would never
   be more than one on screen. The successes are then spread across the coming
   interval rather than all appearing at once, so the window fills steadily
   instead of pulsing. */
function rollElements(){
  Object.keys(ELEMENTS).forEach(id => {
    const e = ELEMENTS[id];
    const made = Trip.made[id] || 0;
    const queued = Trip.queue.reduce((n, q) => n + (q.id === id ? 1 : 0), 0);
    const free = Math.min(capOf(e.max_on_screen) - liveCount(id) - queued,
                          capOf(e.max_per_trip) - made - queued);
    if(free <= 0) return;
    const p = chanceOf(e), span = ROLL_FRAMES();
    for(let i = 0; i < free; i++){
      if(Math.random() >= p) continue;
      Trip.queue.push({id, at: frame + Math.floor(Math.random() * span)});
    }
  });
}
function spawnElement(id){
  const e = ELEMENTS[id];
  const s = e.size;
  Trip.made[id] = (Trip.made[id] || 0) + 1;
  /* Something FLYING BY enters from the top of the frame. Something running
     PARALLEL is already alongside when you notice it, so it starts on screen —
     entering from the top and creeping would just read as a slow fly-by. */
  const parallel = e.motion === "PARALLEL";
  Trip.live.push({
    id, e,
    x: s + Math.random() * (W - s * 2),
    y: parallel ? H * (0.18 + Math.random() * 0.55) : -s,
    lock: num(e.lock_secs, 0) > 0 ? secsToMs(e.lock_secs) : 0,   /* ms */
    life: secsToMs(num(e.life_min, 3) + Math.random() * (num(e.life_max, 3) - num(e.life_min, 3))),
    age: 0,                            /* ms */
    spin: Math.random() * 6.283,       /* prisms start at their own angle */
    seed: Math.random(),
    sway: 0.4 + Math.random() * 0.9,
    state: "LIVE",
    flash: 0,
    fly: 0, fx: 0, fy: 0
  });
}

/* ---- TWO CLOCKS, DELIBERATELY -----------------------------------------------
   Everything in this game steps at 12 fps, and the elements' own animation
   still does — a prism turns, a segment beats, a countdown ring closes, all on
   `frame`. But their POSITION moves on the display's clock instead.

   That is a gameplay decision, not a graphical one. These are small objects
   crossing the screen at speed and they have to be hit with a thumb; at 12 fps
   a segment jumps eight pixels between frames, so the thing under your finger
   when you press is not the thing that was there when you decided to press.
   Sixty frames of motion makes them catchable. The track and the parallax
   behind them stay stepped, so the medium is intact.
   -------------------------------------------------------------------------- */

/* the clock half: spawning, and the countdown that forces a fight */
function stepElements(){
  if(J.phase !== "RIDING" && J.phase !== "ANNOUNCE"){
    /* Anything still in the air when the ride ends is dropped, not carried. */
    if(J.phase !== "FLASH" && J.phase !== "ENCOUNTER"){
      Trip.live.length = 0; Trip.queue.length = 0;
    }
    return;
  }
  TravelMods.prune();
  if(--Trip.nextRoll <= 0){ Trip.nextRoll = ROLL_FRAMES(); rollElements(); }
  for(let i = Trip.queue.length - 1; i >= 0; i--)
    if(Trip.queue[i].at <= frame){ spawnElement(Trip.queue[i].id); Trip.queue.splice(i, 1); }
  for(let i = 0; i < Trip.live.length; i++)
    if(Trip.live[i].flash > 0) Trip.live[i].flash--;
}

/* the display half: position, collection, and leaving */
function stepElementsSmooth(dt){
  if(J.phase !== "RIDING" && J.phase !== "ANNOUNCE") return;
  dt = Math.min(dt, 100);              /* a background tab must not teleport them */
  const k = dt / STEP;                 /* how much of a 12 fps frame this was */
  const bar = tripBarTip(), purse = {x: 10, y: H - 8};
  const t = performance.now();

  for(let i = Trip.live.length - 1; i >= 0; i--){
    const el = Trip.live[i];
    el.age += dt;

    if(el.state === "FLY"){
      el.fly += dt;
      /* segments climb into the trip bar; loot and crystals drop into the purse */
      const tgt = el.e.kind === "SEGMENT" ? bar : purse;
      const p = ease(Math.min(1, el.fly / 260));
      el.x = lerp(el.fx, tgt.x, p);
      el.y = lerp(el.fy, tgt.y, p);
      if(el.fly >= 260){
        Trip.collected += num(el.e.worth, 0);
        payOut(el);
        sfx("map_collect");
        Trip.live.splice(i, 1);
        /* filling the bar is what actually ends the ride */
        if(Trip.collected >= Trip.target && J.phase === "RIDING") endRide();
      }
      continue;
    }
    /* an aggro enemy is counting down to forcing the fight (GDD 4) */
    if(el.lock > 0){
      el.lock -= dt;
      if(el.lock <= 0){
        Trip.live.splice(i, 1);
        encounterOnTrack({id: el.id, station: J.to});
        continue;
      }
    }
    el.y += J.speed * num(el.e.drift, 1) * k;
    el.x += Math.sin(t * 0.0016 + el.seed * 6.3) * el.sway * 0.6 * k;

    /* A COLLECTABLE LEAVES BY THE BOTTOM EDGE, NEVER BY EXPIRING. Its lifetime
       is a safety net for something that somehow stops moving, not a timer —
       a segment that dissolves mid-screen is one the player was still reaching
       for. Enemies do expire: floating away is what they are for. */
    const off = el.y > H + el.e.size;
    const gone = collectable(el) ? off : (off || el.age >= el.life);
    if(gone) Trip.live.splice(i, 1);
  }
}
const collectable = el => el.e.kind === "SEGMENT" || el.e.kind === "CRYSTAL" ||
                          el.e.kind === "LOOT";

/* What a collected element leaves in the vault. Crystals take the emotion of
   the LINE being ridden — what you bring back from a stretch of track is
   coloured by the track. Items are rolled by weight from the items sheet. */
function payOut(el){
  const pay = el.e.payload, n = el.e.amount || 1;
  if(pay === "CRYSTAL" && Run.active) Run.addCrystal(J.line.emotion, n);
  else if(pay === "ITEM" && Run.active){ const it = rollItem(); if(it) Run.addItem(it); }
}
function rollItem(){
  const ids = Object.keys(ITEMS); if(!ids.length) return null;
  let total = 0; ids.forEach(i => { total += (ITEMS[i].weight || 1); });
  let r = Math.random() * total;
  for(let i = 0; i < ids.length; i++){
    r -= (ITEMS[ids[i]].weight || 1);
    if(r <= 0) return ids[i];
  }
  return ids[ids.length - 1];
}

/* ---- what each kind looks like, and what a tap does ---------------------- */
/* Same registry shape as StationFx and EmotionField: keyed by `kind`, with a
   fallback, so a kind the sheet names but the code has not learnt yet renders
   as something plain instead of throwing. */
const ElementFx = {
  _reg: Object.create(null),
  define(kind, spec){ this._reg[kind] = spec; return spec; },
  of(kind){ return this._reg[kind] || this._reg._default; }
};
/* Fading IN is a courtesy; fading OUT is a lie when the thing is still there to
   be tapped. Collectables stay at full strength until they leave the frame. */
const elAlpha = el => {
  if(el.state === "FLY") return 1;
  const inK = Math.min(1, el.age / 160);
  if(collectable(el)) return inK;
  return Math.max(0, Math.min(inK, (el.life - el.age) / 300));
};

/* TRACK SEGMENT — a square that will not hold still: its edges are pushed
   about by two out-of-step waves, and its colour beats between the line's and
   white. The distortion is the point, so it is deliberately overdriven. */
ElementFx.define("SEGMENT", {
  draw(el, col){
    const a = elAlpha(el), s = el.e.size, h = s / 2;
    const t = frame * 0.75 + el.seed * 6.3;
    const beat = 0.5 + 0.5 * Math.sin(frame * 0.9 + el.seed * 6.3);
    /* LIT, not the raw line colour. A segment painted in the line's own hue
       sits against a field painted in that same hue and disappears into it —
       the thing you are meant to be grabbing has to out-glow its background. */
    const lit = mix(col, 1.45);
    const c = el.flash > 0 ? [255, 255, 255]
                           : [lerp(lit[0], 255, beat), lerp(lit[1], 255, beat), lerp(lit[2], 255, beat)];
    for(let dy = -h; dy <= h; dy++){
      /* the row slides, AND its width breathes — one alone reads as a shear.
         Kept under about a quarter of the width, or the square tears into
         shreds and stops reading as an object at all. */
      const slide = Math.sin(dy * 0.9 + t) * 1.5 + Math.sin(dy * 0.37 - t * 1.7) * 0.9;
      const half = h + Math.sin(dy * 0.55 + t * 0.8) * 1.5;
      for(let dx = -half; dx <= half; dx++){
        const edge = Math.abs(dx) / (half + 0.001);
        blendPx(el.x + dx + slide, el.y + dy, c, a * (0.78 + 0.22 * (1 - edge)));
      }
    }
  },
  tap(el){
    if(el.state !== "LIVE") return false;
    el.state = "FLY"; el.fly = 0; el.fx = el.x; el.fy = el.y;
    sfx("map_pick");
    return true;
  }
});

/* CRYSTAL — a prism turning on its vertical axis. Its two visible faces are
   drawn from the SAME spin angle, one lit and one shaded, so the solid reads as
   one object rotating rather than two shapes flickering. Colour-coded to the
   line, because the crystal you carry off a stretch of track is the colour of
   that track. Rotation is on `frame`: the shape turns at 12 fps while the whole
   prism travels at sixty. */
ElementFx.define("CRYSTAL", {
  draw(el, col){
    const a = elAlpha(el), h = el.e.size / 2, w = h * 0.66;
    const ang = el.spin + frame * 0.26;
    const c = Math.cos(ang), sn = Math.sin(ang);
    /* THREE VALUES, NOT TWO. A prism only reads as a solid if the faces are
       far apart in brightness — a lit face, a shaded one, and a hard bright
       seam where they meet. Two similar tints just look like a pill. */
    const lit  = mix(col, 1.65);
    const dark = mix(col, 0.34);
    const edge = [255, 255, 255];
    const seam = w * c;                          /* where the faces meet */
    const white = el.flash > 0;

    for(let dy = -h; dy <= h; dy++){
      const k = Math.abs(dy) / h;
      /* a gem: shoulders near the middle, tapering to points */
      const half = w * (k < 0.34 ? 1 : 1 - ((k - 0.34) / 0.66) * 0.92);
      if(half < 0.4) continue;
      for(let dx = -half; dx <= half; dx++){
        let cpx;
        if(Math.abs(dx - seam) < 0.85) cpx = edge;          /* the ridge */
        else if(dx < seam) cpx = dark;
        else cpx = lit;
        /* the outermost pixel of each row is the facet's rim */
        if(Math.abs(Math.abs(dx) - half) < 0.7) cpx = dx < seam ? mix(col, 0.7) : edge;
        blendPx(el.x + dx, el.y + dy, white ? edge : cpx, a);
      }
    }
    /* a glint that catches once per turn, so the rotation is legible even when
       the prism is small on screen */
    if(sn > 0.78){
      blendPx(el.x + 1, el.y - h + 2, edge, a);
      blendPx(el.x + 2, el.y - h + 2, edge, a * 0.6);
    }
  },
  tap(el){
    if(el.state !== "LIVE") return false;
    el.state = "FLY"; el.fly = 0; el.fx = el.x; el.fy = el.y;
    sfx("map_pick");
    return true;
  }
});

/* LOOT — an echo. Same beating colour as a segment so it reads as collectable,
   but round and softer-edged so it is never confused with progress. */
ElementFx.define("LOOT", {
  draw(el, col){
    const a = elAlpha(el), r = el.e.size / 2;
    const beat = 0.5 + 0.5 * Math.sin(frame * 0.7 + el.seed * 6.3);
    const lit = mix(col, 1.5);
    const c = el.flash > 0 ? [255, 255, 255]
                           : [lerp(lit[0], 255, beat), lerp(lit[1], 255, beat), lerp(lit[2], 255, beat)];
    const t = frame * 0.5 + el.seed * 6.3;
    for(let dy = -r; dy <= r; dy++){
      const k = dy / r;
      const half = r * Math.sqrt(Math.max(0, 1 - k * k)) * (1 + 0.16 * Math.sin(t + dy * 0.8));
      for(let dx = -half; dx <= half; dx++)
        blendPx(el.x + dx, el.y + dy, c, a * 0.9);
    }
    /* a hard glint, so it catches the eye going past at speed */
    blendPx(el.x - 1, el.y - 1, [255, 255, 255], a);
  },
  tap(el){
    if(el.state !== "LIVE") return false;
    el.state = "FLY"; el.fly = 0; el.fx = el.x; el.fy = el.y;
    sfx("map_pick");
    return true;
  }
});

/* ENEMY_PASSIVE — floats past minding its own business. Tapping it picks the
   fight; ignoring it costs nothing (GDD 4). */
ElementFx.define("ENEMY_PASSIVE", {
  draw(el, col){
    const a = elAlpha(el), s = el.e.size, h = s / 2;
    const t = frame * 0.3 + el.seed * 6.3;
    const white = el.flash > 0;
    const body = white ? [255, 255, 255] : mix(col, 0.55);
    const rim  = white ? [255, 255, 255] : col;
    for(let dy = -h; dy <= h; dy++){
      const k = dy / h;
      const half = h * Math.sqrt(Math.max(0, 1 - k * k)) + Math.sin(dy * 0.7 + t) * 1.4;
      for(let dx = -half; dx <= half; dx++){
        const edge = Math.abs(dx) / (half + 0.001);
        blendPx(el.x + dx, el.y + dy, edge > 0.78 ? rim : body, a * 0.95);
      }
    }
    /* an eye, so it reads as something looking back */
    const eye = white ? [40, 34, 30] : [244, 239, 228];
    const ex = Math.round(Math.sin(t * 0.7) * 1.5);
    blendPx(el.x + ex - 1, el.y - 1, eye, a);
    blendPx(el.x + ex,     el.y - 1, eye, a);
    blendPx(el.x + ex - 1, el.y,     eye, a);
    blendPx(el.x + ex,     el.y,     eye, a);
  },
  tap(el){
    if(el.state !== "LIVE") return false;
    el.flash = 4; el.state = "SPENT";
    dropElement(el);
    encounterOnTrack({id: el.id, station: J.to});
    return true;
  }
});

/* ENEMY_AGGRO — locks on and counts down. When it reaches zero the fight
   happens whether or not you wanted it. Drawn with the countdown around it,
   because a forced encounter with no warning is just a punishment. */
ElementFx.define("ENEMY_AGGRO", Object.assign({}, ElementFx.of("ENEMY_PASSIVE"), {
  draw(el, col){
    ElementFx.of("ENEMY_PASSIVE").draw(el, col);
    const a = elAlpha(el), r = el.e.size / 2 + 3;
    const total = secsToMs(num(el.e.lock_secs, 5));   /* the lock is in ms now */
    const left = Math.max(0, el.lock) / total;
    /* the ring closes as the countdown runs out */
    const hot = [255, 90, 90];
    for(let t = 0; t < 6.283 * left; t += 0.16)
      blendPx(el.x + Math.cos(t - 1.57) * r, el.y + Math.sin(t - 1.57) * r, hot, a);
    /* and it flashes once it is nearly out of time */
    if(left < 0.34 && (frame & 2)) blendPx(el.x, el.y - r - 2, hot, a);
  }
}));

/* Remove one element by identity — used when a tap consumes it outright. */
function dropElement(el){
  const i = Trip.live.indexOf(el);
  if(i >= 0) Trip.live.splice(i, 1);
}

ElementFx.define("_default", {
  draw(el, col){ const a = elAlpha(el); disc(el.x | 0, el.y | 0, el.e.size >> 1, packRGB(col)); },
  tap(){ return false; }
});

function drawElements(col){
  for(let i = 0; i < Trip.live.length; i++){
    const el = Trip.live[i];
    ElementFx.of(el.e.kind).draw(el, col);
  }
}
/* THE HIT BOX IS MUCH BIGGER THAN THE PICTURE, on purpose.

   What is being aimed at is a nine-pixel shape crossing the screen in three
   seconds, under a fingertip that covers far more than nine pixels and hides
   what it is aiming at. Matching the target to the art is what made these
   nearly impossible to catch. So the radius is the art's size scaled up, with
   `travelTapR` as a floor — and nearest-first, so where two overlap the tap
   lands on the one that looks nearest. */
function tapElement(px, py){
  const R = num(RULES.travelTapR, 9);
  let best = null, bestD = Infinity;
  for(let i = 0; i < Trip.live.length; i++){
    const el = Trip.live[i];
    if(el.state !== "LIVE") continue;
    const reach = Math.max(R, el.e.size * 1.35);
    const d = Math.hypot(el.x - px, el.y - py);
    if(d < reach && d < bestD){ bestD = d; best = el; }
  }
  return best ? ElementFx.of(best.e.kind).tap(best) : false;
}

/* ---- the EMOTIONAL TRIP bar ---------------------------------------------- */
/* The same undulating silhouette as the battle system's gauge, from the same
   rules — one wave for the bar's outline and a second, longer and shallower
   one inside the fill. Copied in spirit, not imported: the two apps are
   siblings, but the numbers they share come from the spreadsheet. */
/* TRIP_Y clears the DOM route header above it — that strip is about 22 CSS
   pixels tall, which is 7-8 of ours, and the bar's own caption sits 9 above
   TRIP_Y. Any less and the two titles print on top of each other. */
const TRIP_X = 9, TRIP_Y = 25, TRIP_H = 11;
const tripW = () => W - TRIP_X * 2;
const barWave = (x, amp, half, ph) => Math.sin((x / half + ph) * Math.PI) * amp;
/* Where a collected segment flies to: the leading edge of the fill. */
function tripBarTip(){
  const k = Trip.target ? Math.min(1, Trip.collected / Trip.target) : 0;
  return {x: TRIP_X + tripW() * k, y: TRIP_Y + TRIP_H / 2};
}
function drawTripBar(col){
  const w = tripW(), cy = TRIP_Y + TRIP_H / 2, core = TRIP_H / 2;
  const ph = frame * (RULES.barWaveSpeed || 0.1);
  const k = Trip.target ? Math.min(1, Trip.collected / Trip.target) : 0;
  const fill = w * k;
  const ink = [244, 239, 228], dark = [22, 19, 17];
  for(let x = 0; x < w; x++){
    const wv = barWave(x, RULES.barWaveAmp || 1.4, RULES.barWaveHalf || 5.6, ph);
    const top = cy - core - wv, bot = cy + core + wv;
    const ecw = barWave(x, RULES.ecWaveAmp || 0.7, RULES.ecWaveHalf || 19,
                        frame * (RULES.ecWaveSpeed || 0.05));
    for(let y = Math.floor(top); y <= Math.ceil(bot); y++){
      const px = TRIP_X + x;
      const edge = (y <= top + 1) || (y >= bot - 1);
      if(edge){ blendPx(px, y, ink, 0.9); continue; }
      if(x < fill){
        /* a brighter core band riding its own slower wave */
        const band = Math.abs(y - (cy + ecw)) < core * 0.42;
        blendPx(px, y, band ? [lerp(col[0], 255, 0.45), lerp(col[1], 255, 0.45),
                               lerp(col[2], 255, 0.45)] : col, 1);
      }else blendPx(px, y, dark, 0.85);
    }
  }
  text("EMOTIONAL TRIP", W >> 1, TRIP_Y - 9, packRGB(ink), 0);
  text(Trip.collected + "/" + Trip.target, W - TRIP_X, TRIP_Y + TRIP_H + 3, packRGB(ink), -1);
}
