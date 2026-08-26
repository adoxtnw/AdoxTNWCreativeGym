"use strict";
/* NEURO-METRO: AVUI — MAP — the world state
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   Station and track conditions fluctuate with the real world: the hour, the day
   of the week, and Barcelona's weather (GDD 3). This module answers one
   question — what are this station's attributes RIGHT NOW — and everything that
   cares about danger, distance or visibility asks it rather than reading the
   sheet directly.

   THE ANSWER IS A PRODUCT, the same shape used everywhere else in this app:

       live  =  the station's own base  x  every world band that matches

   Bands are rows in `world_bands`. Every matching row multiplies, so BASE is the
   floor and weather, hour and weekday stack onto it. That is deliberately not
   "highest priority wins": a rainy weekday rush hour should be worse than either
   on its own.

   NO SERVER, AND NO NETWORK. The GDD wants a central clock and a live weather
   API broadcasting to every client. There is no backend here, so weather is
   derived DETERMINISTICALLY from the calendar date: every client computes the
   same value for the same day without talking to anything, which is the property
   the server was there to provide. `WorldState.weather()` is the seam — replace
   its body with a fetch and nothing else in the codebase changes.            */

const WEATHERS = ["CLEAR", "CLEAR", "CLOUD", "RAIN", "CLOUD", "CLEAR", "STORM"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const WorldState = {
  _override: null,        /* debug: pin the clock and the sky */

  /* Barcelona local time. `Intl` does the DST arithmetic that hand-rolled
     offset maths always gets wrong twice a year. */
  now(){
    if(this._override) return this._override;
    let d = new Date();
    try{
      const s = d.toLocaleString("en-US", {timeZone: "Europe/Madrid"});
      const t = new Date(s);
      if(!isNaN(t)) d = t;
    }catch(e){ /* no Intl: the device clock will do */ }
    return {hour: d.getHours(), day: DAYS[d.getDay()], date: d.getDate() + d.getMonth() * 31};
  },
  /* THE SEAM. A real forecast goes here; until then the date picks it, so the
     sky is the same for everyone on the same day and reproducible in a test. */
  weather(){
    if(this._override && this._override.weather) return this._override.weather;
    const n = this.now();
    return WEATHERS[n.date % WEATHERS.length];
  },
  /* debug: WorldState.pin({hour:23, day:"SAT", weather:"STORM"}) — pass null to release */
  pin(o){
    this._override = o ? {hour: o.hour | 0, day: o.day || "MON",
                          date: o.date || 0, weather: o.weather || null} : null;
  }
};

/* An hour band may wrap past midnight (23 -> 5), so a plain `>=` and `<` is not
   enough — the same trap the battle system's `moments` matching had. */
function inHours(h, from, to){
  return from <= to ? (h >= from && h < to) : (h >= from || h < to);
}
function bandMatches(b, n, w){
  if(b.day && b.day.length && b.day.indexOf("*") < 0 && b.day.indexOf(n.day) < 0) return false;
  if(b.weather && b.weather.length && b.weather.indexOf("*") < 0 && b.weather.indexOf(w) < 0) return false;
  return inHours(n.hour, b.from_hour | 0, b.to_hour | 0);
}
function activeBands(){
  const n = WorldState.now(), w = WorldState.weather();
  return WORLD_BANDS.filter(b => bandMatches(b, n, w));
}

/* A station's live attributes. `base` of a blank cell is 1, so a station with
   nothing authored simply inherits the world. */
const ATTRS = ["fog", "density", "aggro", "diltransience"];
function stationAttrs(id){
  const s = STATIONS[id] || {};
  const out = {fog: 1, density: 1, aggro: 1, diltransience: 1, threat: 1};
  /* the station's own bases — `density` has no station column of its own, it is
     driven by `threat`, which is what a place's danger actually is */
  out.fog           = num(s.fog, 1);
  out.threat        = num(s.threat, 1);
  out.density       = out.threat;
  out.diltransience = num(s.diltransience, 1);
  activeBands().forEach(b => ATTRS.forEach(k => { out[k] *= num(b[k], 1); }));
  return out;
}

/* How many Track Segments bridge the link INTO this station (GDD 3: Track
   Diltransience). Never fewer than one, or a leg would complete before it began. */
function segmentsFor(stationId){
  return Math.max(1, Math.round((RULES.segBase || 5) * stationAttrs(stationId).diltransience));
}
/* GDD 4: the roll comes round every 1-3 seconds. Density squeezes that towards
   the fast end, so a dangerous stretch is busier as well as nastier. */
function rollSecondsFor(stationId){
  const d = Math.max(0.2, stationAttrs(stationId).density);
  const lo = RULES.rollMinSecs || 1, hi = RULES.rollMaxSecs || 3;
  return Math.max(0.4, (lo + Math.random() * (hi - lo)) / d);
}
/* Fog thick enough to stop you reading a station from the map (GDD 3). */
const isFogged = id => stationAttrs(id).fog >= (RULES.fogPeekHide || 1.6);
