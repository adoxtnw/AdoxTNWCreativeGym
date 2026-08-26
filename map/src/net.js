"use strict";
/* NEURO-METRO: AVUI — MAP — the network, derived
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   THE NETWORK ITSELF IS NO LONGER HERE. `STATIONS` and `LINES` are generated
   into data.js from the `stations` and `metro_lines` sheets — Barcelona L1-L6,
   110 stations, 17 of them interchanges. This file holds only what can be
   DERIVED from those two tables, so there is nothing to keep in sync.

   A STATION IS ONE ROW, however many lines call at it. That is what makes the
   thing a network rather than six unrelated strips, and it is why interchanges
   are found by counting rather than flagged by hand.                       */

/* Which lines call at each station, in sheet order. */
const LINES_AT = (() => {
  const at = {};
  LINES.forEach(l => l.stations.forEach(s => { (at[s] = at[s] || []).push(l); }));
  return at;
})();
const isInterchange = id => (LINES_AT[id] || []).length > 1;
const lineRGB = l => hexRGB(EMOTIONS[l.emotion].hex);

/* The raw reach of the track, with no breathing room baked in: the margin
   around it is a number of SCREEN pixels and belongs to the view (PAD_S in
   mapview.js), because labels and badges are drawn at screen-constant offsets
   and a world-unit pad would shrink exactly when it is needed. */
const NET_BOX = (() => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  Object.keys(STATIONS).forEach(id => {
    const s = STATIONS[id];
    x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y);
    x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y);
  });
  return {x0, y0, x1, y1, w: x1 - x0, h: y1 - y0};
})();

/* ============================ OCTILINEAR ROUTING ============================
   A transit diagram only ever draws at 0, 45 or 90 degrees; any other angle
   reads as a mistake rather than a route. Rather than demand that every one of
   110 stations be placed at an exact multiple of 45 from its neighbour — which
   no one could maintain — each LINK is squared off here. The spreadsheet only
   has to be roughly right.

   A link that is not already square becomes two segments: a 45-degree run
   covering the smaller delta, and a straight run covering the rest. Which
   comes first is chosen to CONTINUE the direction the line arrived in, so runs
   stay long and bends stay rare — the alternative flips the elbow at every
   station and makes a straight avenue look like a staircase.            */
const sgn = v => v < 0 ? -1 : v > 0 ? 1 : 0;

function squareLink(a, b, inDiag){
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if(ax === ay || ax === 0 || ay === 0) return [b];        /* already square */
  const run = Math.abs(ax - ay);                  /* the straight part's length */
  const diagFirst = inDiag;
  if(ax > ay){
    return diagFirst ? [[a[0] + sgn(dx) * ay, b[1]], b]
                     : [[a[0] + sgn(dx) * run, a[1]], b];
  }
  return diagFirst ? [[b[0], a[1] + sgn(dy) * ax], b]
                   : [[a[0], a[1] + sgn(dy) * run], b];
}
const isDiag = (p, q) => Math.abs(q[0] - p[0]) === Math.abs(q[1] - p[1]) &&
                         q[0] !== p[0];

/* The drawable polyline for a line, plus where each stop landed on it.
   Computed once — the geometry is in world units and does not depend on zoom. */
function routeOf(l){
  if(l._path) return l._path;
  const pts = [], stops = [];
  const first = STATIONS[l.stations[0]];
  pts.push([first.x, first.y]); stops.push(0);
  let diagIn = false;
  for(let i = 1; i < l.stations.length; i++){
    const s = STATIONS[l.stations[i]];
    if(!s) continue;
    const a = pts[pts.length - 1], b = [s.x, s.y];
    squareLink(a, b, diagIn).forEach(p => pts.push(p));
    diagIn = isDiag(pts[pts.length - 2], pts[pts.length - 1]);
    stops.push(pts.length - 1);
  }
  l._path = pts; l._stopAt = stops;
  return pts;
}
LINES.forEach(routeOf);

/* ============================ LABEL PLACEMENT ==============================
   110 names cannot be positioned by hand, and hand-placing them would only
   have to be redone the moment a station moves in the sheet. Each name is put
   on the side of its dot with the most empty space: the side whose direction
   is furthest from every piece of track meeting there.

   The choice is made ONCE, in world space, because the schematic does not
   change shape with zoom. What does change is whether there is room, and that
   is settled at draw time by dropping any name that would land on one already
   placed — which is what makes the map declutter itself as you zoom out. */
const SIDES = [
  {k:"R", ux: 1, uy: 0}, {k:"L", ux:-1, uy: 0},
  {k:"B", ux: 0, uy: 1}, {k:"T", ux: 0, uy:-1}
];
function trackDirs(id){
  const dirs = [];
  (LINES_AT[id] || []).forEach(l => {
    const i = l.stations.indexOf(id), at = l._stopAt[i], p = l._path;
    [at - 1, at + 1].forEach(j => {
      if(j < 0 || j >= p.length) return;
      const dx = p[j][0] - p[at][0], dy = p[j][1] - p[at][1];
      const m = Math.hypot(dx, dy) || 1;
      dirs.push([dx / m, dy / m]);
    });
  });
  return dirs;
}
Object.keys(STATIONS).forEach(id => {
  const dirs = trackDirs(id);
  let best = SIDES[0], bestScore = -Infinity;
  SIDES.forEach((s, i) => {
    /* how far this side is from the NEAREST piece of track: dot = 1 means the
       name would lie straight down the line, dot = -1 means dead away from it */
    let score = dirs.length
      ? Math.min.apply(null, dirs.map(d => 1 - (d[0] * s.ux + d[1] * s.uy)))
      : 2;
    score -= i * 1e-3;                    /* stable tie-break: R, L, B, then T */
    if(score > bestScore){ bestScore = score; best = s; }
  });
  STATIONS[id].side = best.k;
});
