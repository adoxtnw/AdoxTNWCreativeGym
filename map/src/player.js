"use strict";
/* NEURO-METRO: AVUI — MAP — who is riding, and what they are carrying
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   The player's stats are NOT defined here. `units.player` in the shared
   spreadsheet is the one definition of MaxMS, starting charge, emotion and the
   three carried Loadouts, and both apps read that same row — the map must never
   grow a second copy of the player.

   WHAT PERSISTS, AND WHY (combat GDD 13.1). MS and EC survive between
   encounters; they are restored only by an explicit event, and today the only
   one is winning a Station Boss. Overload and statuses clear. Overflow is
   derived from MS and EC and so persists implicitly — you can walk onto the
   platform already over your ceiling, and the map has to SHOW that (13.1.3),
   which is why `overflowing()` exists here rather than in the HUD.

   CRYSTALS ARE THE CURRENCY, one per emotion. Items are separate and are lost
   by a roll each rather than by a percentage, so the two are banked
   differently — see run.js.

   NOTHING HERE STORES A STAT. MaxMS, the Emotional Layers and the ability pool
   are asked of `deriveStats()` (gear.js) from what is equipped, because the
   progression GDD gives the player no levels — they ARE their equipment. A
   stored `maxMs` would be a second source of truth that goes stale the moment
   armor changes.

   THE SCHEMA IS AHEAD OF THE UI. `name`, `affinities`, `armor` and `sets` are
   saved and migrated now, though character creation does not exist yet: the
   creation screen will fill fields that are already there, so adding it will
   not need a migration. `needsCreation()` is the hook it will test.         */

const SAVE_KEY = "nm.avui.map.v2";
const SAVE_KEY_V1 = "nm.avui.map.v1";

const Player = {
  at: "CLOT",
  ms: 0, ec: 0,
  code: "",              /* Passenger Code — this save's identity, generated once */
  name: "",
  affinities: [],        /* up to `affinitySlots` emotion ids — colour + a pending bonus */
  armor: "",             /* one piece; decides MaxMS and the Emotional Layers */
  sets: [],              /* `equippedSlots` Move Sets — rows of the loadouts sheet */
  ownedArmor: [],
  ownedSets: [],
  emotion: "",
  crystals: {},          /* {ANGER: n, ...} — banked, safe */
  items: [],             /* banked, safe */
  keys: [],              /* Line Keys held */
  statuses: {}, overloaded: false,

  /* Set only while a run is in the air. Its presence at boot means the browser
     was closed mid-trip, which the GDD (6) counts as a defeat. */
  inTrip: null,

  emptyCrystals(){
    const c = {}; Object.keys(EMOTIONS).forEach(e => { c[e] = 0; }); return c;
  },
  /* Derived, never stored. Read it; do not cache it. */
  stats(){ return deriveStats(this.armor, this.sets); },
  get maxMs(){ return this.stats().maxMs; },
  get maxEc(){ return this.stats().maxEc; },
  get layers(){ return this.stats().layers; },
  get loadouts(){ return this.sets.slice(); },   /* what the §13 descriptor calls them */

  fromSheet(){
    const u = UNITS && UNITS.player;
    this.emotion = u ? u.emotion : "";
    const st = this.stats();
    this.ms = st.maxMs;
    this.ec = Math.round(st.maxMs * (u ? (u.start_ec_pct || 0) : 0));
  },

  /* THE KIT, NOT THE IDENTITY. Everyone starts in the same armor with the same
     sets, so those are seeded from the rules sheet whenever they are missing.
     The NAME AND AFFINITIES ARE DELIBERATELY NOT SEEDED: inventing them is what
     stops `needsCreation()` from ever being true, and then nobody is ever asked
     who they are. An unnamed profile is the signal that creation is owed. */
  seedProfile(){
    if(!this.armor) this.armor = RULES.startArmor || Object.keys(ARMOR)[0] || "";
    if(!this.sets.length)
      this.sets = String(RULES.startSets || "").split("|").map(x => x.trim()).filter(Boolean);
    this.sets = this.sets.slice(0, RULES.equippedSlots || 3);
    if(!this.ownedArmor.length) this.ownedArmor = this.armor ? [this.armor] : [];
    if(!this.ownedSets.length)  this.ownedSets  = this.sets.slice();
  },
  /* The hook character creation will test. Nothing calls it yet. */
  needsCreation(){
    return !this.name || this.affinities.length < (RULES.affinitySlots || 2);
  },
  /* Debug: back to a playable, NAMED default without going through creation.
     `Vault.wipe()` is the one that sends you to the creation screen. */
  reset(){
    this.code = ""; this.name = ""; this.affinities = [];
    this.armor = ""; this.sets = []; this.ownedArmor = []; this.ownedSets = [];
    this.create("PASSENGER", Object.keys(EMOTIONS).slice(0, RULES.affinitySlots || 2));
    this.at = "CLOT";
    this.crystals = this.emptyCrystals();
    this.items = [];
    this.keys = (RULES.startLineKeys || "L1|L2").split("|").map(s => s.trim()).filter(Boolean);
    this.statuses = {}; this.overloaded = false; this.inTrip = null;
    this.save();
  },

  /* ---- equipping. Both refuse anything not owned, so the menu cannot put on
     what the player has not got, whatever it renders. ---- */
  equipArmor(id){
    if(this.ownedArmor.indexOf(id) < 0) return false;
    this.armor = id;
    /* Armor moves the ceiling; MS must not be left above it. */
    this.ms = Math.min(this.ms, this.stats().maxMs);
    this.save(); return true;
  },
  equipSet(slot, id){
    const n = RULES.equippedSlots || 3;
    if(slot < 0 || slot >= n) return false;
    if(id && this.ownedSets.indexOf(id) < 0) return false;
    while(this.sets.length < n) this.sets.push("");
    /* a set already worn elsewhere swaps places rather than being duplicated */
    const at = this.sets.indexOf(id);
    if(id && at >= 0 && at !== slot) this.sets[at] = this.sets[slot];
    this.sets[slot] = id || "";
    this.save(); return true;
  },
  affinityHex(i){
    const e = this.affinities[i || 0];
    return e && EMOTIONS[e] ? EMOTIONS[e].hex : "#f4efe4";
  },

  hasKey(lineId){ return this.keys.indexOf(lineId) >= 0; },
  grantKey(lineId){ if(!this.hasKey(lineId)) this.keys.push(lineId); this.save(); },
  /* 13.1.3 — the player has to be able to see they are in no state for a fight */
  overflowing(){ return this.ec > this.ms; },

  addCrystals(c){ Object.keys(c).forEach(k => { this.crystals[k] = (this.crystals[k] || 0) + c[k]; }); },
  totalCrystals(){ return Object.keys(this.crystals).reduce((n, k) => n + this.crystals[k], 0); },

  /* ---- persistence ----
     THE BLOB IS WRITTEN IN ONE PLACE AND READ IN ONE PLACE. Autosave, the save
     code and the downloadable file are all the same bytes; if they were three
     serialisers they would drift, and the one that drifted would be the one a
     friend needed to restore from. */
  toJSON(){
    return {
      v: 2, code: this.code,
      name: this.name, affinities: this.affinities,
      armor: this.armor, sets: this.sets,
      ownedArmor: this.ownedArmor, ownedSets: this.ownedSets,
      at: this.at, ms: this.ms, ec: this.ec,
      crystals: this.crystals, items: this.items, keys: this.keys,
      inTrip: this.inTrip
    };
  },
  /* EVERY FIELD IS CHECKED AGAINST THE LIVE TABLES. This is not defensiveness
     for its own sake: the same function accepts a file someone was emailed, so
     an id the sheet no longer has, a station that was renamed, or a hand-edited
     number must all degrade to the seeded default rather than corrupt a run.
     Returns the interrupted trip, if any, for the caller to resolve. */
  fromJSON(d){
    this.crystals = this.emptyCrystals();
    this.keys = (RULES.startLineKeys || "L1|L2").split("|").map(s => s.trim()).filter(Boolean);
    if(!d || (d.v !== 1 && d.v !== 2)){ this.seedProfile(); this.fromSheet(); return null; }

    if(typeof d.code === "string") this.code = sanitiseCode(d.code);
    if(typeof d.name === "string") this.name = sanitiseName(d.name);
    if(Array.isArray(d.affinities))
      this.affinities = d.affinities.filter(e => EMOTIONS[e]).slice(0, RULES.affinitySlots || 2);
    if(d.armor && ARMOR[d.armor]) this.armor = d.armor;
    if(Array.isArray(d.sets)) this.sets = d.sets.filter(x => !x || LOADOUTS[x]);
    if(Array.isArray(d.ownedArmor)) this.ownedArmor = d.ownedArmor.filter(x => ARMOR[x]);
    if(Array.isArray(d.ownedSets))  this.ownedSets  = d.ownedSets.filter(x => LOADOUTS[x]);
    if(STATIONS[d.at]) this.at = d.at;
    if(d.crystals && typeof d.crystals === "object") Object.keys(d.crystals).forEach(k => {
      if(this.crystals[k] != null) this.crystals[k] = Math.max(0, d.crystals[k] | 0);
    });
    if(Array.isArray(d.items)) this.items = d.items.filter(x => ITEMS[x]);
    if(Array.isArray(d.keys) && d.keys.length)
      this.keys = d.keys.filter(k => LINES.some(l => l.id === k));
    const interrupted = d.inTrip || null;
    this.inTrip = null;
    this.seedProfile();                  /* fills whatever the save did not carry */
    /* MS and EC persist (combat GDD 13.1) but must not exceed a ceiling that may
       have moved since the save — a v1 save has no armor recorded at all. */
    const st = this.stats();
    this.ms = typeof d.ms === "number" ? Math.min(Math.max(0, d.ms), st.maxMs) : st.maxMs;
    this.ec = typeof d.ec === "number" ? Math.max(0, d.ec) : this.ec;
    return interrupted;
  },

  save(){
    try{ localStorage.setItem(SAVE_KEY, JSON.stringify(this.toJSON())); }
    catch(e){ /* private browsing, quota, no storage — the run still plays */ }
  },
  /* Read whatever is in storage and hand it to fromJSON. Reading a save must
     never throw the boot: every failure path here ends in a seeded profile. */
  load(){
    let raw = null, migrated = false;
    try{
      raw = localStorage.getItem(SAVE_KEY);
      /* A v1 save predates the profile entirely. It is READ, not discarded —
         the station, purse, items and keys in it are real progress, and the
         profile fields simply fall through to the seed. */
      if(!raw){ raw = localStorage.getItem(SAVE_KEY_V1); migrated = !!raw; }
    }catch(e){ return this.fromJSON(null); }
    if(!raw) return this.fromJSON(null);
    let d; try{ d = JSON.parse(raw); }catch(e){ return this.fromJSON(null); }
    const interrupted = this.fromJSON(d);
    if(migrated){ this.save(); try{ localStorage.removeItem(SAVE_KEY_V1); }catch(e){} }
    return interrupted;
  },

  /* ---- creation ---- */
  /* The code is generated ONCE and then carried forever, including through an
     import — it is how one save is told from another, and (later) how a cloud
     row is found. Regenerating it on every save would make every file look like
     a different player. */
  ensureCode(){ if(!this.code) this.code = makeCode(); return this.code; },
  create(name, affinities){
    this.name = sanitiseName(name);
    this.affinities = (affinities || []).filter(e => EMOTIONS[e])
                        .slice(0, RULES.affinitySlots || 2);
    this.armor = ""; this.sets = []; this.ownedArmor = []; this.ownedSets = [];
    this.crystals = this.emptyCrystals(); this.items = [];
    this.keys = (RULES.startLineKeys || "L1|L2").split("|").map(s => s.trim()).filter(Boolean);
    this.at = "CLOT"; this.inTrip = null;
    this.ensureCode();
    this.seedProfile();
    this.fromSheet();
    this.save();
    return this.code;
  }
};

/* ---- sanitising -------------------------------------------------------------
   A NAME THE MAP CANNOT DRAW IS A BUG THE PLAYER SEES. The marker is rendered
   in a hand-made 3x5 font (src/font.js) that has A-Z, 0-9 and a handful of
   marks; anything else comes out as a gap. So the name is folded to what the
   font actually holds at the moment it is entered — not silently mangled later,
   in front of them. Also the one barrier against a name arriving from an
   imported file, which is untrusted text. */
const NAME_MAX = 12;
function sanitiseName(s){
  s = foldText(String(s == null ? "" : s));
  let out = "";
  for(let i = 0; i < s.length && out.length < NAME_MAX; i++)
    if(GLYPHS[s[i]] && s[i] !== "\u00b7") out += s[i];
  return out.replace(/^ +| +$/g, "");
}
/* Crockford-ish: no vowels, so it cannot spell anything, and no 0/O or 1/I to
   misread aloud. */
const CODE_ALPHABET = "23456789BCDFGHJKLMNPQRSTVWXZ";
function makeCode(){
  const pick = n => {
    let s = "";
    const r = (window.crypto && crypto.getRandomValues)
      ? crypto.getRandomValues(new Uint8Array(n)) : null;
    for(let i = 0; i < n; i++){
      const v = r ? r[i] : Math.floor(Math.random() * 256);
      s += CODE_ALPHABET[v % CODE_ALPHABET.length];
    }
    return s;
  };
  return "NM-" + pick(4) + "-" + pick(4);
}
function sanitiseCode(s){
  const up = String(s || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if(up.length < 8) return "";
  const body = up.replace(/^NM/, "");
  return "NM-" + body.slice(0, 4) + "-" + body.slice(4, 8);
}
