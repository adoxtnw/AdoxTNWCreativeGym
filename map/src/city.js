"use strict";
/* NEURO-METRO: AVUI — MAP — what is happening to the city
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   A CITY STATUS is a condition Barcelona is in — rush hour, and whatever else
   gets designed. It is not a station state: a state is a property of a PLACE
   and sits in the stations sheet, while a status happens to the CITY and then
   picks which places it lands on. That is why it needs its own sheet and its
   own registry rather than another `state` value.

   Three things follow from a status being active:

     1. the top of the map grows a tag for it, which explains itself when tapped
     2. the stations it affects have their live attributes multiplied
     3. the map paints something around those stations, so the tag is never the
        only evidence

   WHICH STATIONS, AND WHY IT HAS TO BE DECIDED THIS WAY.

   Picking at random per client would mean two people playing the same city at
   the same moment see different maps, and re-rolling per frame would mean the
   set changes while you look at it. Both are the same bug the weather already
   solved: the answer comes from a HASH of the station, the status and the
   current window, so it is stable for the length of the window and identical on
   every device without anything being sent anywhere.                        */

/* A CELL IS EITHER AN ARRAY OR A STRING, depending on whether its column is in
   the parser's `list` set — `emotions` and `lines` come back split, `hours`
   does not. Reading a cell as one or the other and being wrong is silent: the
   pipes survive into a single string element, nothing matches, and the feature
   simply never happens. So every cell is read through here. */
function listOf(v){
  if(Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  return String(v == null ? "" : v).split(/[|,]/).map(x => x.trim()).filter(Boolean);
}

/* "7-10|17-20" -> [[7,10],[17,20]]. A window may wrap past midnight. */
function parseWindows(s){
  return listOf(s).map(w => {
    const b = w.split("-");
    if(b.length !== 2) return null;
    const from = parseInt(b[0], 10), to = parseInt(b[1], 10);
    return isNaN(from) || isNaN(to) ? null : [from, to];
  }).filter(Boolean);
}

const CityStatus = {
  _force: null,        /* debug: an id to hold on, or "" to hold everything off */
  _cache: {},          /* windowKey -> {statusId -> {stationId:true}} */

  /* Which windows this row is in right now, and which one — the INDEX matters,
     because the morning and the evening rush must not pick the same stations
     just by virtue of being the same status on the same day. */
  windowNow(row){
    const n = WorldState.now();
    const days = listOf(row.day);
    if(days.length && days.indexOf("*") < 0 && days.indexOf(n.day) < 0) return -1;
    const wins = parseWindows(row.hours);
    if(!wins.length) return 0;              /* no hours authored: always on */
    for(let i = 0; i < wins.length; i++)
      if(inHours(n.hour, wins[i][0], wins[i][1])) return i;
    return -1;
  },
  active(){
    if(this._force !== null)
      return CITY_STATUS.filter(r => r.id === this._force);
    return CITY_STATUS.filter(r => this.windowNow(r) >= 0);
  },
  /* The identity of the stretch of time a status is in. Two different days, or
     the morning versus the evening, are different windows and so different
     sets of stations. */
  windowKey(row){
    const n = WorldState.now(), i = this.windowNow(row);
    return row.id + "@" + n.date + "." + (i < 0 ? "x" : i);
  },
  /* Every station the status could land on: those on the lines it names. */
  eligible(row){
    const want = listOf(row.lines);
    return Object.keys(STATIONS).filter(id =>
      (LINES_AT[id] || []).some(l => !want.length || want.indexOf(l.id) >= 0));
  },
  /* The set it actually landed on, worked out once per window and kept. */
  affected(row){
    const key = this.windowKey(row);
    if(this._cache[key]) return this._cache[key];
    const share = num(row.share, 0.4);
    const set = Object.create(null);
    this.eligible(row).forEach(id => {
      if(hashId(id + "|" + key) < share) set[id] = true;
    });
    /* A status that lands on nothing is indistinguishable from one that is not
       happening, and reads as a bug. Give it the one station it came closest
       to affecting rather than showing a tag over an untouched map. */
    if(!Object.keys(set).length){
      const all = this.eligible(row);
      let best = null, bestH = 2;
      all.forEach(id => { const h = hashId(id + "|" + key); if(h < bestH){ bestH = h; best = id; } });
      if(best) set[best] = true;
    }
    this._cache = {};                       /* only ever one window at a time */
    return (this._cache[key] = set);
  },
  /* Every active status landing on this station. */
  onStation(id){
    return this.active().filter(r => this.affected(r)[id]);
  },
  /* What the status does to a station's numbers. Same shape as everything else
     in this app: a product, so several statuses on one station stack. */
  factor(stationId, attr){
    let f = 1;
    this.onStation(stationId).forEach(r => { f *= num(r[attr], 1); });
    return f;
  },
  /* The colours a status is drawn in. A mix stays a MIX — the two are handed to
     the renderer separately rather than averaged, because Rush Hour being
     disgust AND anger is the thing worth seeing, and their average is mud. */
  colours(row){
    return listOf(row.emotions).filter(e => EMOTIONS[e]).map(e => hexRGB(EMOTIONS[e].hex));
  },
  /* debug: CityStatus.force("RUSH_HOUR"), force("") for none, force(null) to
     go back to the clock */
  force(id){ this._force = id; this._cache = {}; dirty = true; }
};

/* ---------------------------------------------------------------------------
   WHAT A STATUS LOOKS LIKE ON THE MAP

   Same registry shape as StationFx, ElementFx and the rest: keyed by the `fx`
   column, with a fallback, so a status whose effect has not been written yet
   still shows up as something rather than throwing. Specs get the same painter
   the station states get, so they never touch the frame buffer either.
   -------------------------------------------------------------------------- */
const CityFx = {
  _reg: Object.create(null),
  define(id, spec){ this._reg[id] = spec; return spec; },
  of(id){ return this._reg[id] || this._reg._default; }
};

/* RUSH HOUR — a ring of dots that will not hold still, alternating between the
   two emotions in the mix. The SHAKE is the whole idea: a crowded platform is
   not a glow, it is a lot of small things jostling, so each dot is thrown a
   pixel or two off its place on the ring every frame and the ring itself
   breathes. Drawn under the station so the dot and its name stay readable. */
CityFx.define("RUSH", {
  live: true,
  under(row, s, b){
    const cols = CityStatus.colours(row);
    if(!cols.length) return;
    const seed = hashId(s.id || "") * 6.283;
    const n = 8, R = b.r + 4 + Math.sin(b.t * 0.34 + seed) * 1.1;
    for(let i = 0; i < n; i++){
      const a = seed + (i / n) * 6.283 + b.t * 0.045;
      /* every dot jitters on its OWN phase, or the ring shivers as one piece
         and reads as a wobbling circle instead of a crowd */
      const jx = Math.sin(b.t * 1.7 + i * 2.1) * 1.4;
      const jy = Math.cos(b.t * 1.9 + i * 1.3) * 1.4;
      const x = b.x + Math.cos(a) * R + jx;
      const y = b.y + Math.sin(a) * R + jy;
      const c = cols[i % cols.length];
      /* the glow: a dimmer pixel around a bright core, so it carries at the
         zoom levels where the dot itself is three pixels across */
      const dim = [c[0] * 0.45, c[1] * 0.45, c[2] * 0.45];
      b.plot(x - 1, y, dim); b.plot(x + 1, y, dim);
      b.plot(x, y - 1, dim); b.plot(x, y + 1, dim);
      b.plot(x, y, [Math.min(255, c[0] * 1.25), Math.min(255, c[1] * 1.25),
                    Math.min(255, c[2] * 1.25)]);
    }
  }
});

/* An unwritten effect still has to be visible, or a status nobody has drawn yet
   looks like a status that is not working. */
CityFx.define("_default", {
  live: true,
  under(row, s, b){
    const c = CityStatus.colours(row)[0] || [244, 239, 228];
    for(let i = 0; i < 4; i++){
      const a = (i / 4) * 6.283 + b.t * 0.08;
      b.plot(b.x + Math.cos(a) * (b.r + 3), b.y + Math.sin(a) * (b.r + 3), c);
    }
  }
});

/* Called from the station loop, once per drawn station. Cheap when nothing is
   happening: `active()` is a filter over a handful of rows. */
function paintCityStatus(s, b){
  const on = CityStatus.onStation(s.id);
  for(let i = 0; i < on.length; i++){
    const fx = CityFx.of(on[i].fx);
    if(fx && fx.under) fx.under(on[i], s, b);
  }
  return on.length > 0;
}
/* Does anything a status is drawing animate? The clock asks, the same way it
   asks StationFx. */
function cityLive(){
  return CityStatus.active().some(r => { const f = CityFx.of(r.fx); return f && f.live; });
}

/* ?status=RUSH_HOUR — hold a status on regardless of the clock, the same way
   ?states=demo scatters the reference station states. Rush Hour is only really
   happening on a weekday between 7 and 10 or 17 and 20, which is a narrow
   window to have to wait for while building the thing. `?status=none` holds
   them all off. */
function applyStatusSwitch(){
  const m = /(?:\?|&)status=([A-Za-z_]+)/.exec(location.search);
  if(!m) return null;
  const id = m[1].toUpperCase();
  CityStatus.force(id === "NONE" ? "" : id);
  return id;
}
