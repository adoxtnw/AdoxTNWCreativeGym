"use strict";
/* NEURO-METRO: AVUI — MAP — travelling between stations
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   ONE STATE MACHINE OWNS THE WHOLE RIDE, from the tap on a neighbouring
   station to the moment control comes back. Every phase has a fixed length in
   CLOCK FRAMES, not milliseconds: the game runs at 12 fps, so counting frames
   is what keeps the sequence in step with everything animating inside it, and
   makes the whole thing deterministic to test.

   Input is refused unless the phase is IDLE. A ride is a cutscene with one
   button in it, and letting the player pan the map underneath a wipe that is
   anchored to a screen position would tear the transition apart.

   THE TWO SCREENS ARE ONE BUFFER. The map and the travel scene are rasterised
   by the same code into the same pixels, so a wipe between them is not a
   composite of two canvases — it is a clip. `clipC` is the whole mechanism. */

const J = {
  at: "CLOT",            /* where the player is standing. The ride starts here. */
  to: null, line: null,
  phase: "IDLE", f: 0,
  dist: 0, speed: 0, trainDY: 0,
  markX: 0, markY: 0,                    /* the marker, in world units */
  cam0: null, cam1: null,
  wipeFrom: "MAP",
  _clack: 0
};

/* Lengths in 12 fps frames. RIDING has none — it runs until END is pressed. */
const PHASE = {
  ZOOM:     {n:  8, next: "WIPE_IN"},
  WIPE_IN:  {n:  9, next: "RIDING"},
  RIDING:   {n:  0, next: null},
  ANNOUNCE: {n: 17, next: "FLASH"},
  FLASH:    {n: 11, next: "BANNER"},
  BANNER:   {n: 30, next: null},        /* branches: dilemma, boss, or the map */
  DILEMMA:  {n:  0, next: null},        /* waits on the player */
  BOSSWAIT: {n:  0, next: null},        /* waits on the encounter screen */
  ENCOUNTER:{n:  0, next: null},        /* a fight on the track; the ride is paused */
  WIPE_OUT: {n: 10, next: "ARRIVE"},
  ARRIVE:   {n: 13, next: "IDLE"}
};
const RIDE_RAMP = 30;        /* frames from a standing start to line speed */
const RIDE_TOP  = 7.0;       /* world units of track per frame at full pelt */
const ZOOM_IN   = 2.4;       /* how close the camera gets before the wipe */
const RING      = 3;         /* the wipe's thick leading edge, in buffer px */

const ease = k => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;
const busy = () => J.phase !== "IDLE";
/* the phases in which a tap lands on a passing element, not on the map */
const catching = () => J.phase === "RIDING" || J.phase === "ANNOUNCE";

/* ---- who you can reach from here, and on which line ---------------------- */
function neighbours(id){
  const out = [];
  (LINES_AT[id] || []).forEach(l => {
    const i = l.stations.indexOf(id);
    [i - 1, i + 1].forEach(k => {
      if(k < 0 || k >= l.stations.length) return;
      out.push({id: l.stations[k], line: l});
    });
  });
  return out;
}
const isNeighbour = id => neighbours(J.at).some(n => n.id === id);

/* ---- one leg of a run ----------------------------------------------------- */
/* Called by run.js, both for the first leg and for every CONTINUE. The first
   leg has to come off the map, so it zooms and wipes; a continuation is already
   on the travel screen and only has to pull away again. */
function startLeg(){
  const leg = Run.current();
  if(!leg) return false;
  const first = !busy() || J.phase === "IDLE";
  J.at = leg.from; J.to = leg.to; J.line = leg.line;
  J.dist = 0; J.speed = 0; J.trainDY = 0;
  resetTrip();                       /* nothing survives from the last leg */
  /* GDD 3: how far apart two stations are is not fixed. It is the target
     station's diltransience, moved again by the weather and the hour. */
  Trip.target = segmentsFor(J.to);
  if(first){ sfx("map_select"); enterPhase("ZOOM"); }
  else     { J.wipeFrom = "BANNER"; enterPhase("WIPE_IN"); }
  return true;
}
/* The two ways a run stops, both routed through run.js so the vault is settled
   in one place. */
function winRun(){  if(Run.winBoss())  leaveToMap(false); }
function exitRun(){ if(Run.exitHere()) leaveToMap(false); }
function loseRun(){ if(Run.defeat())   leaveToMap(true);  }
/* `teleport` is the difference between stepping off a train and being thrown
   the length of the network: a defeat drops you back at the station you
   departed from, so there is no journey to animate. */
function leaveToMap(teleport){
  if(teleport){ J.at = Player.at; }
  J.to = Player.at;
  resetTrip();
  enterPhase("WIPE_OUT");
}
/* The Traveler's Dilemma (GDD 5). */
function chooseExit(){ if(J.phase === "DILEMMA") exitRun(); }
function chooseContinue(){
  if(J.phase !== "DILEMMA") return;
  Run.continueTrip();                /* which calls startLeg() */
}
function endRide(){
  if(J.phase !== "RIDING") return;
  enterPhase("ANNOUNCE");
}
function enterPhase(p){
  J.phase = p; J.f = 0;
  const s = STATIONS[J.at], d = STATIONS[J.to] || s;
  switch(p){
    case "ZOOM":
      J.cam0 = {x: cam.x, y: cam.y, z: cam.z};
      J.cam1 = {x: s.x, y: s.y, z: Math.min(ZOOM_IN, MAX_Z)};
      break;
    case "WIPE_IN":
      /* the music runs from here to the flood of white at the far end */
      sfx("map_depart");
      break;
    case "RIDING": J.wipeFrom = "MAP"; break;
    case "ANNOUNCE": sfx("map_announce"); break;
    case "FLASH":    sfx("map_flash");   break;
    case "BANNER":   sfx("map_arrive");  break;
    case "DILEMMA":  sfx("map_announce"); break;
    case "BOSSWAIT": encounterBoss();     break;
    case "WIPE_OUT":
      sfx("map_return");
      /* Arrive back looking at where the marker still is, so the move to the
         new station is something you watch happen rather than a jump cut. */
      cam.x = s.x; cam.y = s.y; cam.z = Math.min(1.7, MAX_Z); clampCam();
      J.cam0 = {x: cam.x, y: cam.y, z: cam.z};
      J.cam1 = {x: d.x, y: d.y, z: Math.min(1.7, MAX_Z)};
      break;
    case "ARRIVE":   sfx("map_step"); break;
    case "IDLE":
      J.at = Player.at; J.to = null; J.line = null;
      break;
  }
  syncHud();
  dirty = true;
}

/* ---- one clock frame ----------------------------------------------------- */
function journeyStep(){
  if(J.phase === "IDLE") return;
  /* A fight, a platform decision, or a boss: the world holds still until the
     player answers. Elements are NOT cleared — the ride resumes into the same
     stretch of track it left. */
  if(J.phase === "DILEMMA" || J.phase === "BOSSWAIT" || J.phase === "ENCOUNTER"){
    dirty = true; return;
  }
  const P = PHASE[J.phase], k = P.n ? Math.min(1, J.f / P.n) : 0;
  const s = STATIONS[J.at], d = STATIONS[J.to] || s;
  J.markX = s.x; J.markY = s.y;

  switch(J.phase){
    case "ZOOM":
      cam.x = lerp(J.cam0.x, J.cam1.x, ease(k));
      cam.y = lerp(J.cam0.y, J.cam1.y, ease(k));
      cam.z = lerp(J.cam0.z, J.cam1.z, ease(k));
      break;
    case "RIDING":
      /* pulls away, then settles at line speed */
      J.speed = RIDE_TOP * ease(Math.min(1, J.f / RIDE_RAMP));
      J.dist += J.speed;
      /* one clack per rail joint, so the rhythm IS the speed */
      J._clack += J.speed;
      if(J._clack >= SLEEPER * 2){ J._clack = 0; sfx("map_clack", 0.9 + Math.random() * 0.2); }
      break;
    case "ANNOUNCE":
      J.speed = RIDE_TOP; J.dist += J.speed;
      break;
    case "FLASH":
      /* the train winds up and leaves through the top of the frame */
      J.speed = RIDE_TOP * (1 + 3 * k); J.dist += J.speed;
      J.trainDY = -Math.round(ease(k) * (noseY() + CARS * (CAR_H + CAR_GAP) + 8));
      break;
    case "ARRIVE":
      cam.x = lerp(J.cam0.x, J.cam1.x, ease(k));
      cam.y = lerp(J.cam0.y, J.cam1.y, ease(k));
      J.markX = lerp(s.x, d.x, ease(k));
      J.markY = lerp(s.y, d.y, ease(k));
      break;
  }
  stepElements();                    /* spawn, drift, age, cull */
  renderRouteHead();                 /* the segment count moves as you collect */
  if(J.phase === "BANNER" && ++J.f >= P.n){
    /* GDD 5 — the train pauses at the platform, and what happens next is the
       whole wager: another leg, the destination's boss, or the map. */
    const nxt = Run.arrived();
    enterPhase(nxt === "DILEMMA" ? "DILEMMA" : nxt === "BOSS" ? "BOSSWAIT" : "WIPE_OUT");
  }
  else if(P.n && ++J.f >= P.n && P.next) enterPhase(P.next);
  else if(J.phase === "RIDING") J.f++;
  dirty = true;
}

/* ---- the player marker --------------------------------------------------- */
/* A ring swells out of the station, fades up, then shrinks back and vanishes
   behind it, while the station itself wobbles and glows and an arrow bobs
   overhead. One loop, so everything stays in phase with everything else. */
const MARK_LOOP = 24;
const ARROW = ["xxxxx", ".xxx.", "..x.."];

function drawPlayer(g){
  if(J.phase !== "IDLE" && J.phase !== "ZOOM" &&
     J.phase !== "WIPE_IN" && J.phase !== "WIPE_OUT" && J.phase !== "ARRIVE") return;
  const x = bx(J.markX) | 0, y = by(J.markY) | 0;
  if(x < -40 || y < -40 || x > W + 40 || y > H + 40) return;
  const hub = isInterchange(J.at), r0 = (hub ? g.ri : g.r) + 1;
  const p = (frame % MARK_LOOP) / MARK_LOOP;
  const ink = [244, 239, 228];

  /* the glow: three soft rings breathing on the same loop */
  const br = 0.5 + 0.5 * Math.sin(frame * 0.28);
  for(let i = 1; i <= 3; i++)
    ringA(x, y, r0 + i + br * 1.5, 1, ink, 0.16 * (1 - i / 4));

  /* the travelling ring: fades in wide, then closes onto the station */
  const RMAX = r0 + 13;
  const a = p < 0.35 ? p / 0.35 : 1;
  const rr = p < 0.35 ? RMAX : lerp(RMAX, r0 - 1, ease((p - 0.35) / 0.65));
  if(rr > r0 - 1.5) ringA(x, y, rr, 2, ink, 0.85 * a);

  /* the station under it, wobbling: the radii swap in antiphase, which reads
     as a squash rather than as a pulse */
  const wob = Math.sin(frame * 0.42) * 1.15;
  ellipse(x, y, Math.max(1, r0 + wob), Math.max(1, r0 - wob), packRGB(ink));

  /* and the arrow overhead, bobbing */
  const bob = Math.round(Math.sin(frame * 0.34) * 1.6);
  const ay = y - r0 - 8 + bob, ax = x - 2;
  for(let r = 0; r < ARROW.length; r++)
    for(let c = 0; c < 5; c++)
      if(ARROW[r][c] === "x"){ plot(ax + c, ay + r + 1, packRGB([12, 10, 22]));
                               plot(ax + c, ay + r, packRGB(ink)); }

  drawPlayerTag(x, ay, bob);
}

/* WHO YOU ARE AND WHAT STATE YOU ARE IN, on the map itself.

   The progression GDD puts the name above the location indicator, and combat
   GDD 13.1.3 requires Overflow to be legible OUTSIDE combat — MS and EC persist
   between fights, so someone who won their last one at 20 MS with 90 EC has to
   see that before they choose to board. Both belong to the marker, not to a
   panel: this is the one readout that must never need opening.

   Coloured by the first Affinity, which is the whole of what an affinity does
   today (the mechanical bonus is pending). */
function drawPlayerTag(x, ay, bob){
  const name = foldText(Player.name || "");
  const aff = hexRGB(Player.affinityHex(0));
  const ink = [244, 239, 228], shade = [12, 10, 22];
  let ty = ay - FONT_H - 3;

  if(name) text(name, x, ty, packRGB(aff), 0);

  /* MS / EC, tinted only when they are trying to tell you something */
  const low = Player.ms <= Player.maxMs * 0.25;
  const over = Player.overflowing();
  const ms = String(Math.round(Player.ms)), ec = String(Math.round(Player.ec));
  const line = ms + " " + ec;
  const wAll = textW(line), x0 = x - (wAll >> 1);
  ty -= FONT_H + 2;
  text(ms, x0, ty, packRGB(low ? [255, 194, 205] : [176, 255, 225]), 1);
  text(ec, x0 + textW(ms + " "), ty, packRGB(over ? [255, 194, 205] : ink), 1);

  /* and the warning itself, on its own line, blinking on the game clock so it
     cannot be mistaken for part of the numbers */
  if(over && (frame % 12) < 8){
    const tag = "OVERFLOW", tw = textW(tag);
    ty -= FONT_H + 3;
    rect(x - (tw >> 1) - 2, ty - 1, tw + 4, FONT_H + 3, packRGB([255, 194, 205]));
    text(tag, x, ty + 1, packRGB(shade), 0, false);
  }
}

/* ---- overlays ------------------------------------------------------------ */
const wipeMaxR = (sx, sy) => {
  const dx = Math.max(sx, W - sx), dy = Math.max(sy, H - sy);
  return Math.sqrt(dx * dx + dy * dy) + RING + 2;
};
/* The leading edge is drawn as a thick chunky ring rather than a hairline, so
   it reads as the same medium as the metro lines it is covering. */
function wipeRing(sx, sy, r){ ringA(sx, sy, r, RING, [255, 255, 255], 1); }

function overlayTrip(){
  const col = lineRGB(J.line);
  drawElements(col);
  drawTripBar(col);
}
function overlayAnnounce(){
  const k = Math.min(1, J.f / 5);
  if(k <= 0) return;
  const name = STATIONS[J.to].name;
  const y = TRIP_Y + TRIP_H + 12;
  textScaled("PROPERA PARADA...", W >> 1, y, packRGB([244, 239, 228]), 0, 2);
  textScaled(name, W >> 1, y + FONT_H * 2 + 6, packRGB([255, 255, 255]), 0, 2);
}
/* White floods DOWN from the top edge — the light of the next platform
   arriving before the train has stopped. */
function overlayFlash(){
  const k = ease(Math.min(1, J.f / PHASE.FLASH.n));
  const cut = Math.round(k * H * 1.15);
  for(let y = 0; y < Math.min(H, cut); y++){
    const soft = Math.max(0, 1 - (cut - y) / 10);      /* a soft leading edge */
    for(let x = 0; x < W; x++) blendPx(x, y, [255, 255, 255], 1 - soft * 0.75);
  }
}
/* The arrival card: white, with one screen-wide colour-coded band and the
   station's name across it as thickly as it will fit. */
function drawBannerScreen(){
  fillScene(packRGB([255, 255, 255]));
  const col = lineRGB(J.line || LINES[0]);
  const name = (STATIONS[J.to] || STATIONS[J.at] || STATIONS[Player.at]).name;
  const bandH = 44, y0 = (H >> 1) - (bandH >> 1);
  rect(0, y0, W, bandH, packRGB(col));
  rect(0, y0 - 2, W, 2, packRGB(mix(col, 0.6)));
  rect(0, y0 + bandH, W, 2, packRGB(mix(col, 0.6)));
  /* the biggest scale the name actually fits at, never wider than the card */
  let sc = 3;
  while(sc > 1 && textW(foldText(name)) * sc > W - 8) sc--;
  textScaled(name, W >> 1, y0 + (bandH >> 1) - (FONT_H * sc >> 1),
             packRGB([255, 255, 255]), 0, sc);
  const l = (J.line || LINES[0]).id;
  textScaled(l, W >> 1, y0 - 14, packRGB(col), 0, 1);
}

/* ---- what gets drawn, this frame ----------------------------------------- */
function drawScene(g){
  switch(J.phase){
    case "WIPE_IN": {
      /* A first leg opens out of the station on the map; a CONTINUE opens out
         of the middle of the arrival card, because that is what is on screen. */
      const fromBanner = J.wipeFrom === "BANNER";
      const s = STATIONS[J.at];
      const sx = fromBanner ? (W >> 1) : bx(s.x) | 0;
      const sy = fromBanner ? (H >> 1) : by(s.y) | 0;
      const r = ease(J.f / PHASE.WIPE_IN.n) * wipeMaxR(sx, sy);
      if(fromBanner) drawBannerScreen(); else drawMapScene(g);
      clipC = {x: sx, y: sy, r2: r * r};
      drawTravelScene(J);
      clipC = null;
      wipeRing(sx, sy, r);
      return;
    }
    case "WIPE_OUT": {
      const d = STATIONS[Player.at] || STATIONS[J.to] || STATIONS[J.at];
      const sx = bx(d.x) | 0, sy = by(d.y) | 0;
      const r = ease(J.f / PHASE.WIPE_OUT.n) * wipeMaxR(sx, sy);
      drawBannerScreen();
      clipC = {x: sx, y: sy, r2: r * r};
      drawMapScene(g);
      clipC = null;
      wipeRing(sx, sy, r);
      return;
    }
    case "RIDING":   drawTravelScene(J); overlayTrip();    return;
    case "ANNOUNCE": drawTravelScene(J); overlayTrip(); overlayAnnounce(); return;
    case "FLASH":    drawTravelScene(J); overlayFlash();    return;
    case "BANNER":
    case "DILEMMA":
    case "BOSSWAIT": drawBannerScreen(); return;
    case "ENCOUNTER": drawTravelScene(J); overlayTrip(); return;
    default:         drawMapScene(g);    return;
  }
}
/* Which controls exist right now. Every panel is DOM, so this is the one place
   that decides what the player can reach. */
function syncHud(){
  const on = (id, yes) => { const e = $(id); if(e) e.classList.toggle("show", !!yes); };
  const off = (id, yes) => { const e = $(id); if(e) e.classList.toggle("hide", !!yes); };
  on("endRide",  J.phase === "RIDING");          /* debug escape from a ride */
  on("bagBtn",   catching());                    /* what this ride has got you */
  if(!catching()) Baggage.hide();
  Baggage.render();
  /* Progression GDD 5: loadouts cannot change mid-journey, and GDD 2: the game
     saves only on the map. Both hold because the button is simply absent
     everywhere else — no per-action guard to forget. */
  /* ...and not while the menu itself is open: it sits on the bottom edge, which
     is exactly where the tabs are, so it would cover them. */
  on("menuBtn",  J.phase === "IDLE" && !Peek.open && !Menu.open);
  if(busy() && Menu.open) Menu.hide();
  if(J.phase === "DILEMMA") renderDilemma();
  on("dilemma",  J.phase === "DILEMMA");
  syncEncounterHud();
  renderRouteHead();
  musicForPhase();               /* what should be playing is a fact of the phase */
}
