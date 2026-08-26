"use strict";
/* NEURO-METRO: AVUI — the seam between the map and a battle.
   Classic script (no ES modules), matching the battle prototype's convention.

   THIS IS THE WHOLE CONTRACT. It is not invented here: every field comes from
   AVUI_COMBAT_GDD.md §13, which was written to be this interface. Keep the two in
   step — if a field changes here it changes there.

   While the map is being built, `startEncounter()` returns a FIXTURE. That is the
   point: the map never has to run the battle system to be worked on, and the battle
   system never has to run the map. Neither can break the other. */

/* ---- §13.2 — what combat needs FROM the map ---- */
/* `maxMs`, `layers` and `loadouts` are DERIVED FROM EQUIPMENT, not stored — the
   progression GDD gives the player no levels, so armor is the MS ceiling and the
   Emotional Layers, and the three Move Sets are the ability pool. The shape below
   is unchanged from §13.2; only where the numbers come from has moved. */
function encounterDescriptor(player, node){
  return {
    player: {
      maxMs   : player.maxMs,        // ceiling; from the equipped armor
      ms      : player.ms,           // §13.1 — MS PERSISTS between encounters
      ec      : player.ec,           // §13.1 — EC persists in full
      init    : player.init,
      emotion : player.emotion,
      layers  : player.layers ? player.layers.slice() : [],  // granted by the armor
      loadouts: player.loadouts.slice()   // the three Move Sets carried
    },
    enemies : node.enemies.slice(),  // composition: types, counts, levels
    modifiers: node.modifiers ? node.modifiers.slice() : [],
    canFlee : !!node.canFlee         // §13.1.4 — combat assumes this may exist
  };
}

/* ---- §13.3 — what combat returns TO the map ---- */
function blankResult(d){
  return { outcome:"WIN", ms:d.player.ms, ec:d.player.ec, rounds:0, rewards:[] };
}

/* ---- §13.1 — applying a result back to the run ----
   Overload and statuses clear at encounter end; MS and EC do not. Overflow is
   derived from MS and EC, so it persists implicitly — you can walk into the next
   encounter already over your ceiling, which is the point of the whole layer. */
function applyEncounterResult(player, result){
  player.ms = result.ms;
  player.ec = result.ec;
  player.statuses = {};              // cleared
  player.overloaded = false;         // cleared; re-derived from ms/ec on sight
  return result;
}

/* ---- the stub ----
   Replace with a real hand-off once there is a map to hand off FROM. Until then it
   answers instantly with something plausible so map flow can be built and tested. */
async function startEncounter(descriptor){
  const d = descriptor;
  const spent = Math.round(d.player.ms * 0.25);
  return {
    outcome : "WIN",
    ms      : Math.max(1, d.player.ms - spent),
    ec      : Math.min(d.player.maxMs, d.player.ec + 30),
    rounds  : 4,
    rewards : []
  };
}
