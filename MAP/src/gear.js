"use strict";
/* NEURO-METRO: AVUI — MAP — armor, sets, and what they add up to
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   THE PLAYER HAS NO LEVELS (progression GDD 3). Everything they are comes from
   what they are wearing and carrying, so this file is where "how strong am I"
   is answered — and it is answered by ADDING UP EQUIPMENT, never by a stored
   number. Nothing writes `maxMs`; it is asked for.

   ARMOR decides Mental Stamina and which Emotional Layers exist in battle.
   MOVE SETS — which are the `loadouts` sheet under the name the progression GDD
   uses — decide the ability pool and modify Emotional Charge. The player
   carries `equippedSlots` of them (three), independent of how many layers the
   armor grants: armor governs MS and layers, sets govern what you can do.

   PASSIVES ARE NAMED BUT INERT. Both GDDs say the values are pending testing,
   so these registries hold the seam and nothing else. Same shape as StationFx
   and ElementFx: keyed by id, with a `_default` so an unknown passive renders
   as "no effect" instead of throwing.                                        */

function makeFx(label){
  return {
    _reg: Object.create(null),
    define(id, spec){ this._reg[id] = spec; return spec; },
    of(id){ return (id && this._reg[id]) || this._reg._default; },
    known(){ return Object.keys(this._reg).filter(k => k !== "_default"); },
    label
  };
}
const ArmorFx = makeFx("armor passive");
const SetFx   = makeFx("set passive");

/* `blurb` is what the menu prints. `apply` is where the effect will live; none
   of them has one yet, and inventing numbers the GDD says are untested would be
   worse than leaving them plainly empty. */
const inert = blurb => ({blurb, apply: null});
ArmorFx.define("_default",     inert("No passive."));
ArmorFx.define("PAS_THICKSKIN",inert("Thick Skin — pending design."));
ArmorFx.define("PAS_NUMB",     inert("Numb — pending design."));
ArmorFx.define("PAS_DENIAL",   inert("Denial — pending design."));
ArmorFx.define("PAS_ENDURE",   inert("Endure — pending design."));
SetFx.define("_default",       inert("No passive."));

/* Affinities are emotions, not a second table — one row per emotion, one
   palette. The bonus is a placeholder id on that row. */
const AffinityFx = makeFx("affinity bonus");
AffinityFx.define("_default", inert("No bonus."));
Object.keys(EMOTIONS).forEach(e => {
  const id = EMOTIONS[e].affinity_bonus;
  if(id) AffinityFx.define(id, inert(EMOTIONS[e].name + " affinity — pending design."));
});

/* ------------------------------------------------------------------ sums -- */
const armorOf = id => ARMOR[id] || null;
const setOf   = id => LOADOUTS[id] || null;

/* The Emotional Layers a piece of armor grants, outermost first. Blank columns
   mean fewer layers, and no armor means none at all — which is a real state the
   GDD allows (0 to 2), not an error. */
function layersOf(armorId){
  const a = armorOf(armorId); if(!a) return [];
  return [a.layer1, a.layer2].filter(l => l && EMOTIONS[l]);
}
/* The abilities three equipped sets add up to, in slot order and de-duplicated —
   two sets of the same emotion should not offer the same ability twice. */
function poolOf(setIds){
  const out = [], seen = Object.create(null);
  (setIds || []).forEach(sid => {
    const s = setOf(sid); if(!s) return;
    ["slot1", "slot2", "slot3", "slot4"].forEach(k => {
      const a = s[k];
      if(a && ABILITIES[a] && !seen[a]){ seen[a] = 1; out.push(a); }
    });
  });
  return out;
}

/* Everything derived, in one place. `base` is the `units.player` row, which
   stays the floor the equipment builds on rather than being replaced by it. */
function deriveStats(armorId, setIds){
  const base = (UNITS && UNITS.player) || {};
  const a = armorOf(armorId);
  const sets = (setIds || []).map(setOf).filter(Boolean);
  const baseMs = num(base.max_ms, 400);
  const maxMs = Math.max(1, baseMs + num(a && a.ms_mod, 0));
  return {
    maxMs,
    /* EC has no ceiling of its own in the sheet: the bar is measured against
       MaxMS, so a set's ec_mod moves the charge cap relative to that. */
    maxEc: Math.max(1, maxMs + sets.reduce((n, s) => n + num(s.ec_mod, 0), 0)),
    /* WHERE EC SITS AT REST — half of MaxMS, plus whatever the equipment says.
       It is a DERIVED value like every other stat here, never stored: writing
       it into the profile would freeze it at the loadout the player happened to
       be wearing when it was written, and it would then disagree with the armor
       on their back for ever. */
    restEc: Math.max(0, Math.round(maxMs * num(base.start_ec_pct, 0.5)) +
                        sets.reduce((n, s) => n + num(s.ec_mod, 0), 0)),
    layers: layersOf(armorId),
    pool: poolOf(setIds),
    passives: [a && a.passive].concat(sets.map(s => s.passive)).filter(Boolean),
    armor: a, sets
  };
}
