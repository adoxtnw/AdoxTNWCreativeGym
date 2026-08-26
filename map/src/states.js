"use strict";
/* NEURO-METRO: AVUI — MAP — station states
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   A STATION STATE is a condition a place is in — what the map shows there, and
   (later) what it does to a player passing through, in either direction. The
   states themselves are NOT DESIGNED YET, so none is asserted here as real:
   what this file provides is the seam they will plug into, and three reference
   states that exercise every hook so the plumbing is provably alive rather
   than provably typed. Every station's `state` in the spreadsheet is blank, so
   nothing below renders until the design says it should.

   THE SHAPE IS BORROWED FROM BATTLE'S `AbilityFx`, deliberately. That registry
   resolves ability id -> kind -> default, and the same three properties are
   what a station state needs: an id that comes from data, a fallback so an
   unknown value degrades to plain instead of throwing, and paint hooks that
   are fire-and-forget.

   A SPEC MAY IMPLEMENT ANY OF (all optional, all pure paint):
     under(st, g)  drawn BEHIND the dot   — haloes, glows, ground effects
     ring(st, g)   -> [r,g,b] or null     — recolours the dot's rim
     fill(st, g)   -> [r,g,b] or null     — recolours the dot's core
     over(st, g)   drawn ON TOP of the dot — sprites, particles, motes
     ink(st, g)    -> [r,g,b] or null     — recolours the station name
     live          truthy if it animates, so the clock knows to keep redrawing

   `g` is the painter handed in by the renderer: {disc, rect, plot, glyph,
   text, x, y, r, z, t, col}. States never touch the frame buffer directly —
   that keeps them working unchanged if the rasteriser is ever swapped out. */

const StationFx = {
  _reg: Object.create(null),
  define(id, spec){ this._reg[id] = spec; return spec; },
  of(state){ return state ? (this._reg[state] || null) : null; },
  known(){ return Object.keys(this._reg); },
  /* Does anything on the map animate right now? The clock asks, so a map of
     entirely still stations costs nothing per frame. */
  anyLive(){
    return Object.keys(STATIONS).some(id => {
      const f = this.of(STATIONS[id].state); return f && f.live;
    });
  }
};

/* A stable per-station pseudo-random, so motes and phases differ between
   stations but never re-roll between frames — the alternative is a station
   that visibly reshuffles its own particles every tick. */
function hashId(s){
  let h = 2166136261;
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

/* ---------------------------------------------------------------------------
   REFERENCE STATES — placeholders, not design. They exist so the hooks are
   exercised and so there is something to copy when the real states are
   written. Nothing carries them until a `state` is set in the spreadsheet, or
   the ?states=demo switch is used.
   ------------------------------------------------------------------------ */

/* colour changes + a breathing halo */
StationFx.define("SURGE", {
  live: true,
  under(st, g){
    const k = 0.5 + 0.5 * Math.sin(g.t * 0.5 + hashId(st.id) * 6.3);
    g.disc(g.x, g.y, g.r + 2 + Math.round(k * 2), [255, 236, 170]);
  },
  ring(){ return [252, 195, 54]; },
  ink(){  return [255, 236, 170]; }
});

/* particles: motes orbiting the station */
StationFx.define("HAZE", {
  live: true,
  over(st, g){
    const seed = hashId(st.id);
    for(let i = 0; i < 4; i++){
      const a = g.t * 0.18 + seed * 6.3 + i * 1.57;
      const rad = g.r + 3 + (i & 1);
      g.plot(Math.round(g.x + Math.cos(a) * rad),
             Math.round(g.y + Math.sin(a) * rad * 0.7), [150, 210, 190]);
    }
  },
  ink(){ return [150, 210, 190]; }
});

/* a sprite: the station is shut, crossed out, and its name goes cold */
StationFx.define("SHUT", {
  under(st, g){ g.disc(g.x, g.y, g.r + 1, [40, 34, 30]); },
  ring(){ return [92, 83, 72]; },
  fill(){ return [40, 34, 30]; },
  over(st, g){
    const r = g.r - 1;
    for(let i = -r; i <= r; i++){
      g.plot(g.x + i, g.y + i, [220, 210, 200]);
      g.plot(g.x + i, g.y - i, [220, 210, 200]);
    }
  },
  ink(){ return [122, 112, 100]; }
});

/* ?states=demo — scatter the reference states so the machinery can be SEEN
   without inventing content in the spreadsheet. Purely a development switch. */
function applyDemoStates(){
  if(!/(\?|&)states=demo/.test(location.search)) return 0;
  const ids = Object.keys(STATIONS), demo = StationFx.known();
  let n = 0;
  ids.forEach((id, i) => {
    if(i % 9 === 3){ STATIONS[id].state = demo[(n++) % demo.length]; }
  });
  return n;
}
