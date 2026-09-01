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
    /* WHICH ROW THIS THING FIGHTS AS.

       The element ALREADY DECIDED, back when it spawned — an enemy has to look
       like what it is while it is still drifting past, so its units row is
       chosen there and carried here. `travel_elements.unit` is the override
       behind it, for pinning one element to one enemy, and "enemy" is the last
       resort so a malformed descriptor still starts a fight rather than
       throwing on the way in. */
    const row = ELEMENTS[this.enemy.id];
    this.unit = this.enemy.unit || (row && row.unit) || "enemy";
    const em = (UNITS[this.unit] || {}).emotion;
    this.washCol = EMOTIONS[em] ? hexRGB(EMOTIONS[em].hex) : null;

    J.phase = "ENCOUNTER_IN"; J.f = 0;      /* the flood; launch() follows it */
    syncHud();
    dirty = true;
    return true;
  },

  /* Called by the clock once the colour has finished flooding in. From here on
     it is asynchronous: the curtain opens onto a frame that is still loading,
     and the fight answers whenever it is over. */
  async launch(){
    if(this._launched) return;
    this._launched = true;
    J.phase = "ENCOUNTER"; syncHud(); dirty = true;
    let result = null;
    try{
      const p = startEncounter(this.descriptor, this.unit);   /* §13.2, the seam */
      await battleWipeReveal(num(RULES.battleWipeMs, 820));
      result = await p;
    }catch(err){
      /* SAY SO. A silent fallback here once swallowed the entire battle: the
         curtain threw, this caught it, and the ride resumed as though the fight
         had simply been declined. A failure that looks like a feature is worse
         than a crash. */
      console.error("battle handoff failed, resuming the ride:", err);
      result = null;
    }
    /* A frame that never answered is not a defeat — it is a fight that did not
       happen. Fall back to the descriptor's own state so the ride resumes
       exactly as it was rather than the run ending on a loading error. */
    if(!result) result = blankResult(this.descriptor);
    const got = applyRewards(result);
    if(got.length) console.log("battle rewards:", got.join(", "));
    await BattleFrame.close();
    this.resolve(result);
  },

  /* Bookkeeping for a result that came from an actual fight. There used to be a
     second one of these behind a debug panel's buttons; there is one now. */
  resolve(result){
    applyEncounterResult(Player, result);
    const resume = this._resume;
    this.open = false; this.kind = null; this.enemy = null;
    this._resume = null; this._launched = false;
    Player.save();
    if(resume) resume(result.outcome, result);
    dirty = true;
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
  /* LOSING A FIGHT IS NOT LOSING THE RIDE.

     A loss used to zero MS outright, which made every defeat the end of the
     run. It costs a lot of Mental Stamina instead, and the RUN ends only when
     that reaches zero — so a bad fight early on is something you carry, and
     the decision to keep going with it is the wager the Traveler's Dilemma is
     asking about. `WIPED` is the debug button that forces the zero, because
     otherwise the one outcome that ends a run is the one nobody can test. */
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
  /* THE SAME NOISE WHOEVER STARTED IT. An entity that ran its countdown out and
     an entity you reached for are the same event from the ride's point of view —
     the ride has stopped being a ride — and giving them two different sounds
     would be saying they are two things. Here rather than at either call site
     for exactly that reason: this is the one door both go through. */
  sfx("map_screech");
  mapShake(num(RULES.mapShakeMs, 420), num(RULES.mapShakeAmp, 7));
  const back = {phase: J.phase, f: J.f};
  const opened = Encounter.start("TRACK", enemy, () => {
    /* THE OUTCOME DOES NOT DECIDE THIS, THE STAMINA DOES. Win, lose or flee,
       the ride resumes — unless there is nothing left to ride with. */
    if(Player.ms <= 0){ loseRun(); return; }
    J.phase = back.phase;
    /* YOU COME BACK TO A TRAIN ALREADY MOVING. `J.f` drives the acceleration
       ramp, so restoring it exactly would put a fight in the first two seconds
       of a ride back at a crawl — the player would watch the train pull away a
       second time, having just won something. Never below line speed; a fight
       later in the ride keeps its own position. */
    J.f = Math.max(back.f, RIDE_RAMP);
    syncHud(); dirty = true;
  });
  if(!opened) return false;
  /* `start()` has already put the game into the colour flood; `launch()` takes
     it from there once the colour has finished coming in. */
  return true;
}
async function encounterBoss(){
  /* A boss cannot be refused — but nor can it barge in on a fight that is
     still running. One encounter at a time; the platform waits. */
  if(Encounter.open) return;
  if(Encounter.announcing) return;    /* the warning is already up */
  /* CAPTURED NOW, not read in the callback. `Run.dest` is cleared by
     `Run.finish()`, which winRun() reaches through — so by the time the reward
     is being granted the trip that earned it has already been settled and the
     destination is gone. */
  const at = Run.dest;
  /* WHO IS ACTUALLY WAITING HERE. Every station boss used to be the same
     generic `enemy` row, because nothing had ever had a reason to say
     otherwise; an objective is that reason, and it names the unit on its own
     row. Null means nothing is owing at this station and the boss is the fight
     it always was. */
  const unit = Objectives.bossUnit(at);
  /* THREE SECONDS OF WARNING, AND THEN IT STARTS ON ITS OWN. Awaited rather than
     fired alongside: the colour flood and the curtain are the fight beginning,
     and beginning it underneath its own announcement would be the announcement
     for nothing. The phase is already BOSSWAIT, which holds the world still and
     draws the platform banner, so there is nothing to guard against here except
     being asked twice. */
  Encounter.announcing = true;
  await GuardianBanner.show(unit || "enemy");
  Encounter.announcing = false;
  if(Encounter.open) return;          /* something else got in while it played */
  Encounter.start("BOSS", {id: "STATION_BOSS", station: at, unit: unit}, outcome => {
    /* THE REWARD IS CLAIMED BEFORE THE RUN IS SETTLED, and independently of how
       the run settles: `claim` only pays out on a WIN, and a win here is a win
       whatever happens to the vault afterwards. It is also claimed before the
       MS check below, so beating the boss on your last point of stamina still
       counts — you won the fight; the ride is a separate question. */
    const got = Objectives.claim(at, outcome);
    if(got.length) RewardPanel.queue(at, got);
    /* Same rule, and one more case the rule does not cover on its own: being
       beaten by the boss while still standing. The station is not taken, so it
       is not a win — but the run is not lost either, so it resolves the way
       stepping off early does, with the exit share rather than everything. */
    if(Player.ms <= 0){ loseRun(); return; }
    if(outcome === "WIN") winRun(); else exitRun();
  });
}
