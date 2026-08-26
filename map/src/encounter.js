"use strict";
/* NEURO-METRO: AVUI — MAP — where a fight WOULD happen
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   THE BATTLE SYSTEM IS NOT CONNECTED, DELIBERATELY. This is a debug screen: it
   says BATTLE OCCURRED and offers WIN / LOSS / FLED, and the map carries on
   from whichever is pressed.

   It is not a fake, though. It builds a real `encounterDescriptor` from the
   real player and the real enemy, and it returns through the real
   `applyEncounterResult` — so the whole 13 contract is exercised on every
   encounter, MS and EC persist exactly as they will when a battle is doing the
   arithmetic, and hooking the two apps together later is a change to ONE
   function in this file and nothing else anywhere.                           */

const Encounter = {
  open: false,
  kind: null,         /* "TRACK" (an enemy on the line) | "BOSS" (the destination) */
  enemy: null,
  descriptor: null,
  _resume: null,

  /* `after(outcome, result)` is called once the player has chosen. */
  start(kind, enemy, after){
    if(this.open) return false;
    this.open = true; this.kind = kind; this.enemy = enemy || {id: "UNKNOWN"};
    this._resume = after;

    /* 13.2 — what combat needs FROM here. Built even though nothing consumes
       it yet, because the day it does, this must already be right. */
    const st = Player.stats();
    this.descriptor = encounterDescriptor({
      maxMs: st.maxMs, ms: Player.ms, ec: Player.ec,
      init: 0, emotion: Player.emotion,
      layers: st.layers, loadouts: Player.loadouts
    }, {
      enemies: [this.enemy],
      modifiers: this.modifiers(),
      canFlee: kind !== "BOSS"          /* 13.1.4 — you cannot run from a Line's end */
    });
    sfx("map_entity");
    syncEncounterHud();
    dirty = true;
    return true;
  },

  /* The conditions the fight would inherit — the same world state the track
     was spawning under. */
  modifiers(){
    const target = Run.current() ? Run.current().to : Player.at;
    const a = stationAttrs(target);
    return ["FOG:" + a.fog.toFixed(2), "AGGRO:" + a.aggro.toFixed(2),
            "THREAT:" + a.threat.toFixed(2), "WEATHER:" + WorldState.weather()];
  },

  /* WIN / LOSS / FLED. A plausible result, shaped exactly as 13.3 specifies,
     goes back through the real seam. */
  choose(outcome){
    if(!this.open) return;
    const d = this.descriptor, boss = this.kind === "BOSS";
    const cost = Math.round(d.player.ms * (outcome === "LOSS" ? 1 : boss ? 0.45 : 0.22));
    const result = {
      outcome,
      ms: outcome === "LOSS" ? 0 : Math.max(1, d.player.ms - cost),
      ec: Math.min(Player.maxMs, d.player.ec + (outcome === "FLED" ? 10 : 30)),
      rounds: outcome === "FLED" ? 1 : boss ? 8 : 4,
      rewards: []
    };
    applyEncounterResult(Player, result);      /* 13.1 — MS/EC persist, statuses clear */
    const resume = this._resume;
    this.open = false; this.kind = null; this.enemy = null;
    this._resume = null;
    syncEncounterHud();
    Player.save();
    if(resume) resume(outcome, result);
    dirty = true;
  }
};

/* Losing on the track is losing the run, exactly as losing to the boss is.
   The ride is PAUSED rather than torn down: the phase and its frame counter are
   put aside and restored, so the train resumes at the speed it was doing
   instead of pulling away from a standing start again. */
function encounterOnTrack(enemy){
  /* THE PHASE MOVES ONLY IF THE ENCOUNTER ACTUALLY OPENED.

     Setting it first deadlocked the ride: two enemies can trigger in the same
     frame — a Hunter's countdown expiring while a passive one is tapped — and
     `start()` refuses the second because one is already open. The phase had
     already been changed by then, so the refused call left the game in
     ENCOUNTER with nothing to resume it, and the first one's callback restored
     a "previous phase" that was itself ENCOUNTER. The ride simply stopped. */
  if(Encounter.open) return false;
  const back = {phase: J.phase, f: J.f};
  const opened = Encounter.start("TRACK", enemy, outcome => {
    if(outcome === "LOSS"){ loseRun(); return; }
    J.phase = back.phase; J.f = back.f;
    syncHud(); dirty = true;
  });
  if(!opened) return false;
  J.phase = "ENCOUNTER"; syncHud(); dirty = true;
  return true;
}
function encounterBoss(){
  /* A boss cannot be refused: if a track fight is somehow still open when the
     platform arrives, close it first rather than silently skipping the boss. */
  if(Encounter.open) Encounter.choose("FLED");
  Encounter.start("BOSS", {id: "STATION_BOSS", station: Run.dest}, outcome => {
    if(outcome === "LOSS") loseRun(); else winRun();
  });
}
