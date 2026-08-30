"use strict";
/* NEURO-METRO: AVUI — MAP — progression objectives
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   AN OBJECTIVE IS A THING YOU CAN GET AND THE PLACE YOU GET IT. That is the
   whole of it, and all three parts live in the `objectives` sheet: WHERE
   (`station`), WHAT YOU HAVE TO DO (`requirement`, plus the `unit` it names),
   and WHAT YOU GET (`reward`). Nothing about any particular objective is in
   this file — Fondo, Sant Antoni and Urquinaona appear nowhere in the code.
   Adding a fourth is a row in a spreadsheet.

   WHY THE REQUIREMENT IS A VOCABULARY AND NOT A CONDITION.

   The obvious design is a free-text condition per row, and it is the wrong one:
   every objective would then be its own special case, checked in its own place,
   and the fifth would need code the way the first did. `requirement` is instead
   a small closed set of verbs that this file knows how to test. Today there is
   exactly one — DEFEAT_BOSS — and a row asking for anything else says so in the
   console and is inert, rather than silently never firing.

   WHAT AN OBJECTIVE OWNS AND WHAT IT DOES NOT. It owns nothing but references.
   The armor lives in the armor sheet, the Move Set in the loadouts sheet, the
   boss in the units sheet, and everything her fight LOOKS and SOUNDS like — the
   brightness, the camera flashes, the theme — lives on that units row, because
   those are facts about a fight and not about progression. This sheet only says
   who, where and what for.

   REWARDS ARE RESOLVED AGAINST THE LIVE TABLES at the moment they are granted,
   the same way a save file is read: an id the sheet no longer has grants
   nothing rather than writing a dangling reference into a profile. The
   workbook's build-time validator is what makes that a non-event in practice —
   see _validate() in build_workbook.py.                                      */

const Objectives = {
  /* Every row for one station, done or not. Kept separate from `pending`
     because the station panel wants to say "you have already done this" and the
     marker painter wants only the ones still owing. */
  at(stationId){
    if(typeof OBJECTIVES === "undefined") return [];
    return OBJECTIVES.filter(o => o.station === stationId);
  },
  /* Still owing. `once` is what retires a row: an objective that is not `once`
     may be cleared again and keeps its marker for ever, which is the shape a
     repeatable bounty would need. */
  pending(stationId){
    return this.at(stationId).filter(o => !(o.once && Player.didObjective(o.id)));
  },
  /* Does this station have anything to show? Asked once per drawn station per
     frame, so it stays a filter over a handful of rows and nothing more. */
  anyAt(stationId){ return this.pending(stationId).length > 0; },
  /* Is anything on the whole map animating? The clock asks this the same way it
     asks StationFx.anyLive() — a map with no objectives left costs nothing. */
  anyLive(){
    if(typeof OBJECTIVES === "undefined") return false;
    return OBJECTIVES.some(o => !(o.once && Player.didObjective(o.id)));
  },

  /* ---- the requirement ----------------------------------------------------
     WHO IS WAITING AT THE END OF THIS TRIP. The station boss is otherwise the
     generic `enemy` row: the map has never had a reason to say which unit a
     particular platform's boss is, because until now every platform's boss was
     the same one. An objective is exactly that reason.

     Returns null when there is nothing owing here, and the caller falls back to
     what it did before — so a station with no objective, or one already
     cleared, fights the fight it always did. */
  bossUnit(stationId){
    const o = this.pending(stationId).find(r => r.requirement === "DEFEAT_BOSS" && r.unit);
    return (o && UNITS[o.unit]) ? o.unit : null;
  },

  /* ---- claiming ----------------------------------------------------------
     Called with the outcome of the fight the requirement asked for. Only a WIN
     claims anything; anything else leaves the row exactly as it was, which is
     what makes a lost boss fight something you can go back and try again.

     Returns a list of {kind, id, label} for whatever was actually granted, so
     the caller can show it. An empty list means nothing happened — either
     nothing was owing, or every id in the reward has gone stale. */
  claim(stationId, outcome){
    if(outcome !== "WIN") return [];
    const got = [];
    this.pending(stationId).forEach(o => {
      if(o.requirement !== "DEFEAT_BOSS"){
        console.warn("objectives." + o.id + ": requirement '" + o.requirement +
                     "' is not implemented, so it can never be cleared");
        return;
      }
      (o.reward || []).forEach(spec => {
        const g = this.grant(spec);
        if(g) got.push(g);
      });
      Player.completeObjective(o.id);
    });
    if(got.length) Player.save();
    return got;
  },

  /* One `KIND:ID`. The same grammar as units.drops and stations.spawn, so it
     reads the way the rest of the spreadsheet reads.

     ARMOR and SET are added to what the profile OWNS and are deliberately NOT
     equipped: what you are wearing is a decision, and taking that decision away
     from the player at the exact moment they have earned something is the wrong
     end of it. The menu is where it goes on. */
  grant(spec){
    const bits = String(spec || "").split(":");
    const kind = (bits[0] || "").trim().toUpperCase();
    const id   = (bits[1] || "").trim();
    if(!kind || !id) return null;
    if(kind === "ARMOR"){
      if(!ARMOR[id]){ console.warn("objective reward: no armor '" + id + "'"); return null; }
      Player.grantArmor(id);
      return {kind, id, label: ARMOR[id].name || id, what: "ARMOR"};
    }
    if(kind === "SET"){
      if(!LOADOUTS[id]){ console.warn("objective reward: no Move Set '" + id + "'"); return null; }
      Player.grantSet(id);
      return {kind, id, label: LOADOUTS[id].name || id, what: "MOVE SET"};
    }
    if(kind === "KEY"){
      const line = LINES.find(l => l.id === id);
      if(!line){ console.warn("objective reward: no line '" + id + "'"); return null; }
      Player.grantKey(id);
      return {kind, id, label: id + " · " + (line.name || ""), what: "LINE KEY"};
    }
    console.warn("objective reward: '" + kind + "' is not ARMOR / SET / KEY");
    return null;
  },

  /* The colour a row is drawn in. An objective without an emotion is still
     drawn — in the interface's own ink — rather than not drawn at all. */
  colour(o){
    const e = o && EMOTIONS[o.emotion];
    return e ? hexRGB(e.hex) : [244, 239, 228];
  },

  /* ---- what the station card warns you about -----------------------------
     A `?` says there is SOMETHING here. It should not also have to say WHAT —
     walking into a Line Manager because the marker looked like the marker over
     a chest is the kind of surprise that reads as the game not having told you.

     `card_tag` is the sheet's answer, and it falls back to the obvious one: a
     row that names a unit is a fight, a row that does not is a find. So an
     objective added later gets the right warning without anyone remembering to
     fill the column in. */
  cardTag(o){
    const want = (o.card_tag || (o.unit ? "ENTITY" : "TREASURE")).toUpperCase();
    if(want === "TREASURE")
      return {kind: "TREASURE", text: "OPPORTUNITY FOR TREASURE", icon: "DISC"};
    return {kind: "ENTITY", text: "EXTREME EMOTIONAL DISTURBANCE", icon: "WARN"};
  }
};

/* ---------------------------------------------------------------------------
   WHAT AN OBJECTIVE LOOKS LIKE ON THE MAP

   Same registry shape as StationFx, CityFx and ElementFx — keyed by the sheet's
   `marker` column, with a `_default` — so a row naming a marker nobody has drawn
   yet still shows up as something rather than throwing or vanishing.

   `b` is the painter the station loop hands round: {plot, disc, rect, text, x,
   y, r, z, t, col}. Markers never touch the frame buffer, for the same reason
   station states do not.
   -------------------------------------------------------------------------- */
const ObjectiveFx = {
  _reg: Object.create(null),
  define(id, spec){ this._reg[id] = spec; return spec; },
  of(id){ return (id && this._reg[id]) || this._reg._default; }
};

/* The 3x5 "?" the marker is built from. Deliberately NOT added to GLYPHS: that
   table is the station-name font, and a name containing a question mark would
   then render one where sanitiseName() is supposed to have removed it. This
   shape is drawn at its own scale anyway — a 3x5 glyph at map size is three
   pixels tall and unreadable. */
const QMARK = ["xx.", "..x", ".x.", "...", ".x."];

/* QUESTION — a floating, glowing, colour-coded ? inside a white circle that
   wobbles and beats.

   THE TWO MOTIONS ARE SEPARATE ON PURPOSE. The WOBBLE is position: the whole
   marker sways, on two different periods for x and y, so it drifts in a small
   figure rather than sliding along one axis. The BEAT is size: the white circle
   swells and shrinks on its own clock. Tying them together — a marker that grew
   as it rose — would read as one animation, and it is supposed to read as
   something hovering and something breathing.

   EVERY MARKER IS ON ITS OWN PHASE, offset by a hash of the objective's id. A
   screen with three of them pulsing in lockstep looks like a UI element
   repeated; three out of step look like three separate things. */
ObjectiveFx.define("QUESTION", {
  live: true,
  over(o, s, b){
    const col = Objectives.colour(o);
    const seed = hashId(o.id) * 6.283;

    /* SIZED OFF THE STATION, so the marker holds its proportions at every zoom
       instead of being a fixed pixel size that swamps the map when you pull out
       and disappears when you go in. */
    const px = Math.max(1, Math.round(b.r * 0.42));      /* one glyph pixel */
    const base = Math.max(4, Math.round(px * 3.1));

    /* One beat per `objectiveBeatMs`, converted from milliseconds into frames of
       the 12 fps clock this brush's `t` is counted in. */
    const w = (2 * Math.PI * STEP_MS) / num(RULES.objectiveBeatMs, 760);
    const beat = Math.sin(b.t * w + seed);               /* -1 .. 1 */
    const R = base + beat * Math.max(1, px * 0.5);

    const wob = num(RULES.objectiveWobble, 0.9) * px;
    const x = b.x + Math.sin(b.t * 0.19 + seed) * wob;
    /* it FLOATS: parked clear of the station and its name, and the vertical sway
       is a different period from the horizontal one so the path is a lazy figure
       rather than a diagonal */
    const y = b.y - b.r - base - 3 + Math.cos(b.t * 0.13 + seed * 1.7) * wob;

    /* THE GLOW, under everything. Two rings of the emotion's colour, dimmer as
       they go out, breathing on the same beat as the circle — so the colour
       carries at the zoom levels where the ? itself is a few pixels wide and
       the marker still reads as coloured rather than as a white dot. */
    const glow = 0.6 + 0.4 * (beat * 0.5 + 0.5);
    for(let ring = 2; ring >= 1; ring--){
      /* the OUTER ring is the dim one, and it is drawn first — these are filled
         discs, so painting them small-to-large would bury the bright one */
      const k = glow * (ring === 1 ? 1 : 0.42);
      b.disc(x, y, R + ring * Math.max(1, Math.round(px * 0.6)),
             [col[0] * k, col[1] * k, col[2] * k]);
    }
    /* the white circle itself, over its own glow */
    b.disc(x, y, R, [255, 255, 255]);

    /* THE ? IS THE COLOUR-CODED PART, and it is drawn last so nothing is over
       it. Each glyph pixel is a block `px` across, which is what keeps it a
       question mark rather than a smudge once the station dot is six pixels
       wide. */
    const gw = 3 * px, gh = 5 * px;
    const gx = Math.round(x - gw / 2), gy = Math.round(y - gh / 2);
    for(let ry = 0; ry < 5; ry++) for(let rx = 0; rx < 3; rx++){
      if(QMARK[ry][rx] !== "x") continue;
      b.rect(gx + rx * px, gy + ry * px, px, px, col);
    }
  }
});

/* An unwritten marker still has to be visible, or a row whose `marker` column
   holds a typo looks like an objective that is not working. */
ObjectiveFx.define("_default", {
  live: true,
  over(o, s, b){
    const col = Objectives.colour(o);
    const y = b.y - b.r - 6 + Math.sin(b.t * 0.2 + hashId(o.id) * 6.3) * 1.5;
    b.disc(b.x, y, 3, [255, 255, 255]);
    b.disc(b.x, y, 1, col);
  }
});

/* Called from the station loop, once per drawn station, AFTER the dot and its
   state — a marker is an annotation on a station and has to sit over it.
   Cheap when there is nothing owing: `pending()` is a filter over three rows. */
function paintObjectives(s, b){
  const on = Objectives.pending(s.id);
  for(let i = 0; i < on.length; i++){
    const fx = ObjectiveFx.of(on[i].marker);
    if(fx && fx.over) fx.over(on[i], s, b);
  }
  return on.length > 0;
}
/* Does anything a marker is drawing animate? The clock asks, the same way it
   asks StationFx and CityStatus. */
function objectivesLive(){
  if(typeof OBJECTIVES === "undefined") return false;
  return OBJECTIVES.some(o => {
    if(o.once && Player.didObjective(o.id)) return false;
    const f = ObjectiveFx.of(o.marker);
    return f && f.live;
  });
}
