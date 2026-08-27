#!/usr/bin/env node
/*
NEURO-METRO: AVUI — does every enemy's rings actually survive being drawn?

    node shared/tools/check_rings.js

WHY THIS EXISTS. An enemy's TIER is a silhouette: WEAK wears concentric
triangles, STRONG concentric seven-pointed stars, REGULAR the original circles.
`paint()` draws them by stretching the distance from the centre by a factor
that depends on the angle — which means a band's thickness IN PIXELS is
multiplied by that factor too. At the narrow part of a triangle or between two
points of a star, the thin inner rings went under one pixel, broke into dashes,
and then vanished altogether.

That is invisible in code review and nearly invisible in a screenshot: the
sprite still looks like a sprite, it has just quietly lost a layer the player is
supposed to be able to count. So it is measured.

WHAT IT MEASURES. For every enemy in the units sheet, over a full cycle of the
ring breathing: the widest GAP in each ring, measured in pixels of arc at that
ring's own radius. An unbroken ring scores about 1, because its pixels are
touching. A ring that has broken into dashes scores several. The plain circle
enemies are the reference and they pass, which is what makes the number mean
something.

The two rules that keep it passing are `enemyShapeFill` (thicker bands for a
shaped enemy) and `enemyShapeBreathe` (less breathing, so two neighbouring
bands stop closing on each other). Change either and run this.

It reads the REAL rings.js and the REAL generated data.js. Nothing is
reimplemented here, because a check that reimplements the thing it is checking
only ever proves the copy right.
*/
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path");

const AVUI  = path.resolve(__dirname, "..", "..");
const APP   = path.join(AVUI, "BATTLE SYSTEM");
const CANVAS = 64;                       // sprIn/sprOut are 64x64 (EW in rings.js)

/* data.js is a classic script: its top-level `const`s never touch the context
   object, so it is asked for them by name on the way out. */
function loadData(){
  const src = fs.readFileSync(path.join(APP, "data.js"), "utf8");
  const ctx = {console}; vm.createContext(ctx);
  return vm.runInContext(src + "\n;({RULES,EMOTIONS,UNITS});", ctx);
}
/* rings.js reaches for the DOM the moment it defines its canvases. Everything
   above that line is pure, and that is the part being tested. */
function loadRings(rules, emotions){
  const src = fs.readFileSync(path.join(APP, "src", "rings.js"), "utf8");
  const cut = src.indexOf("const CV={");
  if(cut < 0) throw new Error("rings.js no longer has the `const CV={` line this "
                            + "script cuts at — find the new boundary between the "
                            + "pure geometry and the DOM.");
  const ctx = {console, RULES: rules, EMOTIONS: emotions,
               S: {enemy: {tier: "REGULAR"}, player: {}},
               hexRGB: h => [1,3,5].map(i => parseInt(h.substr(i,2), 16))};
  vm.createContext(ctx);
  return vm.runInContext(src.slice(0, cut)
    + "\n;({ringsOf, shapeF, tierShape, tierScale, slotGeom});", ctx);
}

const D = loadData();
const R = D.RULES;
const G = loadRings(R, D.EMOTIONS);

/* enemyCfg lives below the cut, with the canvases. Mirrored here from the same
   rules — if it ever grows a term this line has to grow with it. */
function enemyCfg(u){
  const k = G.tierScale(u), shaped = G.tierShape(u) !== R.enemyShapeRegular;
  const n = (v, d) => (v === "" || v == null || isNaN(+v)) ? d : +v;
  return {baseR:   R.enemyRingBaseR   * k,
          spacing: R.enemyRingSpacing * k,
          breathe: R.enemyRingBreathe * (shaped ? n(R.enemyShapeBreathe, 0.5) : 1),
          fill:    R.layerFill        * (shaped ? n(R.enemyShapeFill, 2.0) : 1)};
}

/* WHAT THE RENDERER ACTUALLY WRITES, and how far apart its pixels get.

   Two earlier versions of this measured the wrong thing, and both were wrong in
   the same direction — they accused the plain circle enemies, which have looked
   correct on screen since the day they were drawn.

     - A RAY from the centre rounds to integer pixels, so it steps straight past
       a band that IS drawn, just not on that exact line.
     - FIXED ANGULAR SECTORS cannot work for rings of different sizes: the
       innermost ring is about twenty-five pixels round in total, so most of
       seventy-two five-degree sectors are empty by geometry, not by fault.

   What actually reads as a broken ring is a GAP: two neighbouring pixels of the
   same band separated by a stretch of nothing. So the mask is built exactly as
   `paint` builds it, every pixel of a ring is bucketed by angle, and the answer
   is the widest angular gap between consecutive pixels — converted to pixels of
   arc at that ring's own radius, which makes it comparable across sizes.

   A solid ring one pixel thick scores around 1: its pixels are adjacent. Three
   is a visible dash. The circle enemies are the reference, and they pass. */
const ARCSTEPS = 720;                    // half a degree
function worstGap(unitId){
  const row = D.UNITS[unitId];
  const unit = {tier: row.tier || "REGULAR",
                /* `layers` arrives already split: it is one of data.js's list
                   columns, so it is an array here and not a pipe string. */
                layers: (row.layers || []).map((e, i) => ({e, pos: i, flash: 0}))};
  const cfg = enemyCfg(unit);
  const c = CANVAS / 2;
  let worst = null, when = "";
  for(let t = 0; t < 40; t++){
    const rings = G.ringsOf(unit, t, cfg, "all");
    if(!worst) worst = rings.map(() => 0);
    const shape = G.shapeF(G.tierShape(unit), t * (+R.enemyShapeSpin || 0.018));
    const hit = rings.map(() => new Uint8Array(ARCSTEPS));
    const rad = rings.map(() => 0), cnt = rings.map(() => 0);
    for(let y = 0; y < CANVAS; y++)
      for(let x = 0; x < CANVAS; x++){
        const dx = x - c, dy = y - c;
        const p = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
        const d = shape ? p / shape(ang) : p;
        for(let j = 0; j < rings.length; j++)
          if(d <= rings[j].outer && d >= rings[j].inner){
            const a = Math.floor(((ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * ARCSTEPS);
            hit[j][a % ARCSTEPS] = 1; rad[j] += p; cnt[j]++; break;
          }
      }
    for(let j = 0; j < rings.length; j++){
      if(!cnt[j]) continue;                        /* a slot with no radius left */
      const meanR = rad[j] / cnt[j];
      /* widest run of empty half-degrees, wrapping round */
      let run = 0, longest = 0, first = -1;
      for(let a = 0; a < ARCSTEPS; a++){
        if(hit[j][a]){ if(first < 0) first = a; if(run > longest) longest = run; run = 0; }
        else run++;
      }
      if(first < 0) continue;
      let tail = run; for(let a = 0; a < first; a++) tail++;   /* the wrap */
      if(tail > longest) longest = tail;
      /* the gap, as pixels of arc at this ring's own radius */
      const px = (longest + 1) / ARCSTEPS * Math.PI * 2 * meanR;
      if(px > worst[j]){ worst[j] = px; when = "ring " + j + " at breath " + t; }
    }
  }
  return {gaps: worst.map(v => +v.toFixed(1)), when,
          shape: G.tierShape(unit), tier: unit.tier};
}
const GAP_LIMIT = 3;                     /* pixels of arc; above this it reads as a dash */

let failed = 0;
const enemies = Object.keys(D.UNITS)
  .filter(id => String(D.UNITS[id].tags || "").toUpperCase() === "ENEMY");
console.log("widest gap in each ring, outermost first, in pixels of arc, over a full breath.");
console.log("an unbroken ring scores about 1. anything over " + GAP_LIMIT + " reads as a dashed ring.\n");
for(const id of enemies){
  const {gaps, when, shape, tier} = worstGap(id);
  const bad = gaps.some(v => v > GAP_LIMIT);
  if(bad) failed++;
  console.log("  " + (bad ? "FAIL" : "ok  ") + "  " + id.padEnd(24)
            + (tier + "/" + shape).padEnd(18) + "[" + gaps.join(" ") + "]"
            + (bad ? "   worst: " + when : ""));
}
console.log("");
if(failed){
  console.log("! " + failed + " enemy(ies) have a ring that breaks into dashes.");
  console.log("  Raise `enemyShapeFill` or lower `enemyShapeBreathe` in the rules sheet,");
  console.log("  rebuild (build_workbook -> export_csv -> build_data) and run this again.");
  process.exit(1);
}
console.log("every ring of every enemy holds together all the way round, through a full breath.");
