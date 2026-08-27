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

/* ---- WHICH ENEMY THIS LINE PRODUCES --------------------------------------
   An element row says an enemy may appear; it does not say WHO. That comes from
   the units sheet, off each enemy's own `spawn_lines`:

       L2:0.15|L5:0.15     an uncommon sight on either line
       L1:1.0|*:0.6        at home on Line 1, and rides everywhere else

   `*` is every line. It is not decoration — without it a line with no units of
   its own would produce no enemies at all, and L3, L4 and L6 have none yet.

   The weights are RELATIVE, drawn against each other exactly the way the element
   roll draws its kinds: one enemy comes out, and a 0.15 next to a 1.0 is the
   rare one. Nothing here decides how OFTEN an enemy appears at all — that is the
   element row's `chance`. This only decides which one it is once the ride has
   already decided to produce something.

   THE ELEMENT ROW CAN STILL OVERRULE IT. A `unit` in travel_elements pins that
   element to one enemy for ever, which is how a scripted encounter would be
   built. Blank means roll, and both enemy rows are blank today. */
const ENEMY_UNITS = Object.keys(UNITS).filter(id => {
  const u = UNITS[id];
  return u && u.enabled !== false && String(u.tags || "").toUpperCase() === "ENEMY";
});
function spawnWeight(unitId, lineId){
  const spec = UNITS[unitId] && UNITS[unitId].spawn_lines;
  if(!spec || !spec.length) return 0;
  let w = 0;
  for(let i = 0; i < spec.length; i++){
    const bits = String(spec[i]).split(":");
    const name = bits[0].trim().toUpperCase();
    if(name !== "*" && name !== String(lineId).toUpperCase()) continue;
    const v = parseFloat(bits[1]);
    /* A NAMED LINE BEATS THE WILDCARD rather than adding to it. "L1:1.0|*:0.6"
       has to mean "1.0 at home, 0.6 elsewhere", not 1.6 at home. */
    if(name === "*"){ if(w === 0) w = isNaN(v) ? 1 : v; }
    else return isNaN(v) ? 1 : v;
  }
  return w;
}
function pickEnemyUnit(lineId){
  let total = 0;
  const slices = [];
  for(let i = 0; i < ENEMY_UNITS.length; i++){
    const w = spawnWeight(ENEMY_UNITS[i], lineId);
    if(w <= 0) continue;
    total += w; slices.push({id: ENEMY_UNITS[i], upto: total});
  }
  /* A line nothing wants to appear on still has to produce something, or the
     element that already rolled would spawn as nobody. */
  if(!slices.length) return ENEMY_UNITS[0] || "enemy";
  const r = Math.random() * total;
  for(let i = 0; i < slices.length; i++) if(r < slices[i].upto) return slices[i].id;
  return slices[slices.length - 1].id;
}
const isEnemyKind = kind => kind === "ENEMY_PASSIVE" || kind === "ENEMY_AGGRO";
/* WEAK / REGULAR / STRONG, as a size on the ride. The element row's `size` is
   still the baseline; a tier scales it, so retuning the element retunes all
   three at once. */
function tierSize(base, tier){
  const k = tier === "WEAK"   ? num(RULES.rideScaleWeak, 0.72)
          : tier === "STRONG" ? num(RULES.rideScaleStrong, 1.45) : 1;
  return Math.max(4, Math.round(base * k));
}

/* ---- the ride's element state -------------------------------------------- */
const Trip = {
  live: [],          /* every element currently in the world */
  made: {},          /* how many of each this ride has produced, ever */
  collected: 0,      /* the true count */
  shown: 0,          /* what the bar is currently drawing — it chases `collected` */
  from: 0, tw: 0,    /* the tween the bar is in the middle of */
  flash: 0,          /* ms of white left on the bar */
  target: 10,
  nextRoll: 0
};
/* HOW MANY MAY BE OUT AT ONCE, ALL KINDS TOGETHER. The per-kind caps in the
   sheet are ceilings on variety; this is the ceiling on noise. */
const maxLive = () => Math.max(1, num(RULES.travelMaxLive, 5));
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
  Trip.made = {};
  Trip.collected = 0;
  Trip.shown = 0; Trip.from = 0; Trip.tw = 0; Trip.flash = 0;
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
/* ONE ROLL PRODUCES AT MOST ONE ELEMENT, AND OFTEN NOTHING.

   Every eligible kind's resolved chance is a SLICE of the same single draw, so
   the kinds compete for one outcome instead of each flipping its own coin — and
   whatever the slices do not cover is the chance that the roll produces nothing
   at all. That gap is the whole point. A ride needs quiet stretches; rolling
   each kind separately meant something appeared on almost every tick, which
   made the interval meaningless and the window permanently full.

   A kind that has hit its own ceiling simply is not offered a slice, which
   hands its share of the draw to the empty remainder — a board thick with
   segments naturally goes quieter rather than substituting something else in. */
function rollElements(){
  const slices = [];
  let total = 0;
  Object.keys(ELEMENTS).forEach(id => {
    const e = ELEMENTS[id];
    if(liveCount(id) >= capOf(e.max_on_screen)) return;
    if((Trip.made[id] || 0) >= capOf(e.max_per_trip)) return;
    const p = chanceOf(e);
    if(p <= 0) return;
    total += p;
    slices.push({id, upto: total});
  });
  const r = Math.random();
  for(let i = 0; i < slices.length; i++)
    if(r < slices[i].upto){ spawnElement(slices[i].id); return true; }
  return false;
}
function spawnElement(id){
  const e = ELEMENTS[id];
  Trip.made[id] = (Trip.made[id] || 0) + 1;
  /* An enemy is decided AT SPAWN, not when it is tapped: what it is has to be
     visible while it is still floating past, because deciding whether to take
     the fight is the whole of the interaction. */
  const unit = isEnemyKind(e.kind) ? (e.unit || pickEnemyUnit(J.line && J.line.id)) : "";
  const row  = unit ? UNITS[unit] : null;
  const tier = (row && row.tier) || "REGULAR";
  /* ITS OWN COLOUR, NOT THE LINE'S. Everything else on the ride is painted in
     the line's emotion, which is what makes the line feel like a place. An enemy
     is the one thing that is not OF the place, and reading its type off the
     screen before you commit is the only warning there is. */
  const col  = row && EMOTIONS[row.emotion] ? hexRGB(EMOTIONS[row.emotion].hex) : null;
  const s = isEnemyKind(e.kind) ? tierSize(e.size, tier) : e.size;
  /* Something FLYING BY enters from the top of the frame. Something running
     PARALLEL is already alongside when you notice it, so it starts on screen —
     entering from the top and creeping would just read as a slow fly-by. */
  const parallel = e.motion === "PARALLEL";
  Trip.live.push({
    id, e, unit, tier, col, size: s,
    x: s + Math.random() * (W - s * 2),
    y: parallel ? H * (0.18 + Math.random() * 0.55) : -s,
    lock: num(e.lock_secs, 0) > 0 ? secsToMs(e.lock_secs) : 0,   /* ms */
    life: secsToMs(num(e.life_min, 3) + Math.random() * (num(e.life_max, 3) - num(e.life_min, 3))),
    age: 0,                            /* ms */
    spin: Math.random() * 6.283,       /* prisms start at their own angle */
    /* AND SO DOES EVERY SEGMENT. They are identical squares otherwise, and a
       stream of identical squares all sitting square to the frame reads as one
       repeated sprite rather than as debris. Half turn one way, half the other. */
    rot: Math.random() * 6.283,
    rspin: (Math.random() < 0.5 ? -1 : 1) * (0.012 + Math.random() * 0.045),
    /* which way an enemy's silhouette turns. Two on screen turning in lockstep
       read as one sprite drawn twice. */
    rspinDir: Math.random() < 0.5 ? -1 : 1,
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
    if(J.phase !== "FLASH" && J.phase !== "ENCOUNTER" && J.phase !== "ENCOUNTER_IN")
      Trip.live.length = 0;
    return;
  }
  TravelMods.prune();
  if(Trip.nextRoll > 0) Trip.nextRoll--;
  /* A FULL BOARD HOLDS THE ROLL RATHER THAN WASTING IT. When the timer comes
     round and there is no room, the roll is not skipped and rescheduled — it
     waits, so the instant something leaves the frame or is tapped away the next
     one happens. Skipping instead would mean a busy stretch went quiet for a
     further whole interval after it finally cleared. */
  if(Trip.nextRoll <= 0 && Trip.live.length < maxLive()){
    rollElements();                  /* which may well decide on nothing */
    Trip.nextRoll = ROLL_FRAMES();   /* either way, the wait starts again */
  }
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
  stepTripBar(dt);

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
        const worth = num(el.e.worth, 0);
        if(worth > 0){
          /* the bar sets off from wherever it had reached, not from the last
             whole number, or a quick second pickup snaps backwards first */
          Trip.from = Trip.shown; Trip.tw = 0;
          Trip.collected += worth;
          Trip.flash = num(RULES.tripFlashMs, 260);
          sfx("map_tripup");
        }else sfx("map_collect");
        payOut(el);
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
        encounterOnTrack({id: el.id, station: J.to, unit: el.unit});
        continue;
      }
    }
    el.y += J.speed * num(el.e.drift, 1) * k;
    el.x += Math.sin(t * 0.0016 + el.seed * 6.3) * el.sway * 0.6 * k;

    /* A COLLECTABLE LEAVES BY THE BOTTOM EDGE, NEVER BY EXPIRING. Its lifetime
       is a safety net for something that somehow stops moving, not a timer —
       a segment that dissolves mid-screen is one the player was still reaching
       for. Enemies do expire: floating away is what they are for. */
    const off = el.y > H + el.size;
    const gone = collectable(el) ? off : (off || el.age >= el.life);
    if(gone) Trip.live.splice(i, 1);
  }
}
const collectable = el => el.e.kind === "SEGMENT" || el.e.kind === "CRYSTAL";

/* What a collected element leaves in the vault. Crystals take the emotion of
   the LINE being ridden — what you bring back from a stretch of track is
   coloured by the track.

   THERE IS NO ITEM DROP. Items are not designed yet, and a payload of
   placeholders is worse than an empty pocket: it fills the Baggage screen with
   things that mean nothing and quietly teaches the player they are worthless.
   The `items` sheet still exists, empty, so the machinery has a shape to fill. */
function payOut(el){
  const pay = el.e.payload, n = el.e.amount || 1;
  if(pay === "CRYSTAL" && Run.active) Run.addCrystal(J.line.emotion, n);
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
    const a = elAlpha(el), h = el.size / 2;
    const t = frame * 0.75 + el.seed * 6.3;
    const beat = 0.5 + 0.5 * Math.sin(frame * 0.9 + el.seed * 6.3);
    /* LIT, not the raw line colour. A segment painted in the line's own hue
       sits against a field painted in that same hue and disappears into it —
       the thing you are meant to be grabbing has to out-glow its background. */
    const lit = mix(col, 1.45);
    const c = el.flash > 0 ? [255, 255, 255]
                           : [lerp(lit[0], 255, beat), lerp(lit[1], 255, beat), lerp(lit[2], 255, beat)];
    /* ROTATED, AND EACH ONE DIFFERENTLY. Drawn by walking the DESTINATION
       pixels and asking each one where it falls inside the unrotated square,
       rather than by rotating the source: rotating the source leaves holes,
       because a turned grid does not land on whole pixels. */
    const ang = el.rot + frame * el.rspin;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const R = Math.ceil(h * 1.45) + 2;                /* the turned bounding box */
    for(let dy = -R; dy <= R; dy++)
      for(let dx = -R; dx <= R; dx++){
        const lx =  dx * ca + dy * sa;                /* into the square's own frame */
        const ly = -dx * sa + dy * ca;
        if(Math.abs(ly) > h) continue;
        /* the row slides, AND its width breathes — one alone reads as a shear.
           Kept under about a quarter of the width, or the square tears into
           shreds and stops reading as an object at all. */
        const slide = Math.sin(ly * 0.9 + t) * 1.5 + Math.sin(ly * 0.37 - t * 1.7) * 0.9;
        const half  = h + Math.sin(ly * 0.55 + t * 0.8) * 1.5;
        const ox = lx - slide;
        if(Math.abs(ox) > half) continue;
        const edge = Math.abs(ox) / (half + 0.001);
        blendPx(el.x + dx, el.y + dy, c, a * (0.78 + 0.22 * (1 - edge)));
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
    const a = elAlpha(el), h = el.size / 2, w = h * 0.66;
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

/* ENEMY_PASSIVE — floats past minding its own business. Tapping it picks the
   fight; ignoring it costs nothing (GDD 4).

   ITS TIER IS ITS SHAPE, and the same shape it will wear in the fight: a WEAK
   one is a triangle, a STRONG one a seven-pointed star, an ordinary one the
   round thing this has always been. That is the entire warning system. A tap
   here commits you to a fight you cannot leave, so what you are about to take
   on has to be readable while it is still drifting past — from its OUTLINE at a
   glance, and from its COLOUR, which is its own emotion and not the line's.

   All three are drawn the same way: one function of angle saying how far the
   body reaches, and a scan of the bounding box asking each pixel whether it is
   inside. Same idea as the battle system's rings, arrived at separately — the
   two apps share the spreadsheet, never code.                                */
const RIDE_TAU = Math.PI * 2;
/* 1 at a vertex, less between: the shape inscribed in a circle of radius h. */
function ridePolyF(a, n){
  const seg = RIDE_TAU / n, m = ((a % seg) + seg) % seg - seg / 2;
  return Math.cos(Math.PI / n) / Math.cos(m);
}
function rideStarF(a, n, inner){
  const seg = RIDE_TAU / n, m = ((a % seg) + seg) % seg;
  return inner + (1 - inner) * Math.abs(m / seg * 2 - 1);
}
/* `-PI/2` puts a point at twelve o'clock, because atan2 starts at three. */
const RIDE_UP = -Math.PI / 2;
function tierShapeF(tier, spin){
  if(tier === "WEAK")   return a => ridePolyF(a - spin - RIDE_UP, 3);
  if(tier === "STRONG") return a => rideStarF(a - spin - RIDE_UP,
                                     Math.max(3, num(RULES.enemyStarPoints, 7)),
                                     num(RULES.enemyStarInner, 0.62));
  return null;                          /* REGULAR keeps the round body */
}
function drawEnemyBody(el, col){
  const a = elAlpha(el), s = el.size, h = s / 2;
  const t = frame * 0.3 + el.seed * 6.3;
  const white = el.flash > 0;
  const body = white ? [255, 255, 255] : mix(col, 0.55);
  const rim  = white ? [255, 255, 255] : col;
  const f = tierShapeF(el.tier, frame * num(RULES.enemyShapeSpin, 0.018) * el.rspinDir);
  if(!f){
    /* the original: a disc whose edge is pushed about row by row */
    for(let dy = -h; dy <= h; dy++){
      const k = dy / h;
      const half = h * Math.sqrt(Math.max(0, 1 - k * k)) + Math.sin(dy * 0.7 + t) * 1.4;
      for(let dx = -half; dx <= half; dx++){
        const edge = Math.abs(dx) / (half + 0.001);
        blendPx(el.x + dx, el.y + dy, edge > 0.78 ? rim : body, a * 0.95);
      }
    }
  }else{
    /* A POLYGON HAS TO BREATHE TOO, or it reads as a printed icon sitting on the
       window rather than as something out there with you. The same wobble the
       round body has, applied to the reach instead of to the row width. */
    const R = Math.ceil(h) + 2;
    for(let dy = -R; dy <= R; dy++)
      for(let dx = -R; dx <= R; dx++){
        const p = Math.hypot(dx, dy); if(p > R) continue;
        const ang = Math.atan2(dy, dx);
        /* the wobble is a FRACTION of the body, not a fixed number of pixels: at a
           weak enemy's size a flat 0.8px push is a sixth of its radius and eats
           the points it is supposed to be animating */
        const reach = h * f(ang) + Math.sin(ang * 3 + t) * Math.max(0.35, Math.min(1.1, h * 0.09));
        if(p > reach) continue;
        blendPx(el.x + dx, el.y + dy, p > reach * 0.72 ? rim : body, a * 0.95);
      }
  }
  /* an eye, so it reads as something looking back. Every tier keeps it: the
     silhouette says what KIND of thing it is, the eye says it is a thing. */
  const eye = white ? [40, 34, 30] : [244, 239, 228];
  const ex = Math.round(Math.sin(t * 0.7) * 1.5);
  const ey = el.tier === "WEAK" ? 1 : el.tier === "STRONG" ? -1 : 0;   /* inside the shape, not on its edge */
  blendPx(el.x + ex - 1, el.y - 1 + ey, eye, a);
  blendPx(el.x + ex,     el.y - 1 + ey, eye, a);
  blendPx(el.x + ex - 1, el.y     + ey, eye, a);
  blendPx(el.x + ex,     el.y     + ey, eye, a);
}
ElementFx.define("ENEMY_PASSIVE", {
  draw(el, col){ drawEnemyBody(el, el.col || col); },
  tap(el){
    if(el.state !== "LIVE") return false;
    el.flash = 4; el.state = "SPENT";
    dropElement(el);
    /* WHICH enemy travels with the encounter. Without it the fight would look up
       the element row instead and every ride would be the same opponent, which
       is what this whole pass exists to stop. */
    encounterOnTrack({id: el.id, station: J.to, unit: el.unit});
    return true;
  }
});

/* ENEMY_AGGRO — locks on and counts down. When it reaches zero the fight
   happens whether or not you wanted it. Drawn with the countdown around it,
   because a forced encounter with no warning is just a punishment. */
ElementFx.define("ENEMY_AGGRO", Object.assign({}, ElementFx.of("ENEMY_PASSIVE"), {
  draw(el, col){
    ElementFx.of("ENEMY_PASSIVE").draw(el, col);
    col = el.col || col;
    const a = elAlpha(el), r = el.size / 2 + 3;
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
  draw(el, col){ const a = elAlpha(el); disc(el.x | 0, el.y | 0, el.size >> 1, packRGB(col)); },
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
    const reach = Math.max(R, el.size * 1.35);
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
   TRIP_Y. Any less and the two titles print on top of each other.

   EDGE TO EDGE. The bar is the ride's one measure of progress, and an inset
   bar reads as a widget sitting on the screen; a bar that runs off both sides
   reads as part of the vehicle. */
const TRIP_X = 0, TRIP_Y = 25, TRIP_H = 11;
const tripW = () => W;
const barWave = (x, amp, half, ph) => Math.sin((x / half + ph) * Math.PI) * amp;
/* Where a collected segment flies to: the leading edge of the fill AS DRAWN,
   not as counted — the segment has to land on the end of the bar the player can
   actually see, which is still on its way to the new value. */
function tripBarTip(){
  const k = Trip.target ? Math.min(1, Trip.shown / Trip.target) : 0;
  return {x: TRIP_X + tripW() * k, y: TRIP_Y + TRIP_H / 2};
}
/* THE BAR CHASES THE COUNT, IT DOES NOT JUMP TO IT.

   A number that changes is information; a bar that surges forward and settles
   is a reward, and this is the only reward the ride has. It overshoots slightly
   and comes back — the ease that reads as something with weight arriving rather
   than a value being assigned — and it flashes white on the way, so the eye is
   pulled to the bar at the moment the thing it was chasing lands in it. */
const easeOutBack = k => {
  const c1 = 1.34, c3 = c1 + 1, p = k - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
};
function stepTripBar(dt){
  if(Trip.flash > 0) Trip.flash = Math.max(0, Trip.flash - dt);
  if(Trip.shown === Trip.collected) return;
  const dur = Math.max(60, num(RULES.tripFillMs, 520));
  Trip.tw = Math.min(dur, Trip.tw + dt);
  const k = Trip.tw / dur;
  Trip.shown = Trip.from + (Trip.collected - Trip.from) * easeOutBack(k);
  if(k >= 1) Trip.shown = Trip.collected;
}
function drawTripBar(col){
  const w = tripW(), cy = TRIP_Y + TRIP_H / 2, core = TRIP_H / 2;
  const ph = frame * (RULES.barWaveSpeed || 0.1);
  /* the DRAWN value, and clamped — easeOutBack deliberately overshoots, and an
     overshoot at the far end would run the fill off the end of the bar */
  const k = Trip.target ? Math.max(0, Math.min(1, Trip.shown / Trip.target)) : 0;
  const fill = w * k;
  const ink = [244, 239, 228], dark = [22, 19, 17];
  /* the flash rides on TOP of the fill colour rather than replacing the bar, so
     the shape never disappears at the moment it is being looked at */
  const fk = Trip.flash > 0 ? Trip.flash / Math.max(1, num(RULES.tripFlashMs, 260)) : 0;
  if(fk > 0) col = [lerp(col[0], 255, fk * 0.85), lerp(col[1], 255, fk * 0.85),
                    lerp(col[2], 255, fk * 0.85)];
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
  /* the COUNT is the true value: it ticks over the instant the segment lands,
     while the bar is still catching up to it */
  /* clear of the bar's LOWER WAVE, not just of the bar: the silhouette swings
     about 1.4px past the body, and at +3 the digits sat in it */
  text(Trip.collected + "/" + Trip.target, W - 3, TRIP_Y + TRIP_H + 6, packRGB(ink), -1);
}
