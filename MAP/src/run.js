"use strict";
/* NEURO-METRO: AVUI — MAP — the wager
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   A RUN is a whole trip: an origin, a chosen destination, the route between
   them, and a VAULT of everything picked up along the way that is not yet
   safe. journey.js still owns one leg — the ride, the wipes, the platform. This
   owns the sequence of legs and what each arrival costs.

   THE VAULT IS THE POINT (GDD 5). Nothing collected on the track is yours until
   you get off:

     EXIT at a platform    keep `exitKeepPct` of crystals, roll each item
     CONTINUE              keep everything, heal nothing, ride on
     BOSS won              keep everything, MS fully restored, dock
     DEFEAT anywhere       keep `defeatKeepPct`, roll each item, back to the
                           station you departed from

   Crystals and items are banked DIFFERENTLY on purpose: a currency takes a
   percentage cleanly, and a thing you are holding either survives or does not.

   MS AND EC ARE NEVER TOUCHED HERE except by the boss reward. Combat GDD 13.1:
   they persist, and the only restoration is an explicit event. Riding on with
   40 MS is supposed to feel like a decision.                                 */

const Run = {
  active: false,
  from: null, dest: null,
  legs: [], leg: 0,
  vault: {crystals: {}, items: []},

  emptyVault(){ return {crystals: Player.emptyCrystals(), items: []}; },

  /* ---- starting ---- */
  begin(destId){
    if(this.active || busy()) return {ok: false, reason: "BUSY"};
    const r = routeFor(destId);
    if(!r.ok) return r;
    if(!r.legs.length) return {ok: false, reason: "ALREADY_THERE"};
    this.active = true;
    this.from = Player.at; this.dest = destId;
    this.legs = r.legs; this.leg = 0;
    this.vault = this.emptyVault();
    /* GDD 6 — a trip in the air is recorded, so force-closing the browser
       cannot be used to dodge a bad run */
    this.mark();
    startLeg();
    return {ok: true, legs: r.legs.length};
  },

  /* Snapshot the trip INCLUDING the vault. Closing the browser is defined as a
     defeat, and a defeat keeps `defeatKeepPct` — which it cannot do if what was
     in the air was never written down. Called at every point the vault moves. */
  mark(){
    if(!this.active) return;
    Player.inTrip = {from: this.from, dest: this.dest,
                     crystals: this.vault.crystals, items: this.vault.items.slice()};
    Player.save();
  },
  current(){ return this.legs[this.leg] || null; },
  isLastLeg(){ return this.leg >= this.legs.length - 1; },

  /* ---- collecting ---- */
  addCrystal(emotion, n){
    const v = this.vault.crystals;
    v[emotion] = (v[emotion] || 0) + (n || 1);
    this.mark();
  },
  addItem(id){ this.vault.items.push(id); this.mark(); },
  vaultCrystals(){ const v = this.vault.crystals;
    return Object.keys(v).reduce((n, k) => n + v[k], 0); },

  /* ---- banking ---- */
  /* keepPct applies to the currency; itemLoss is rolled PER ITEM. */
  bank(keepPct, itemLoss){
    const kept = {};
    Object.keys(this.vault.crystals).forEach(k => {
      kept[k] = Math.floor(this.vault.crystals[k] * keepPct);
    });
    Player.addCrystals(kept);
    const survived = this.vault.items.filter(() => Math.random() >= itemLoss);
    survived.forEach(i => Player.items.push(i));
    const lostItems = this.vault.items.length - survived.length;
    this.vault = this.emptyVault();
    return {crystals: kept, items: survived.length, lostItems};
  },

  /* ---- the three ways a run ends ----
     Each is a NO-OP when no run is in the air. Without that guard an ending
     fired at the wrong moment banks a phantom vault against whatever `from`
     and `dest` were left over from the last trip, and moves the player to a
     station they never departed from. */
  exitHere(){
    if(!this.active) return null;
    const at = this.current() ? this.current().to : Player.at;
    const got = this.bank(RULES.exitKeepPct != null ? RULES.exitKeepPct : 0.6,
                          RULES.itemLossOnExit != null ? RULES.itemLossOnExit : 0.4);
    this.finish(at);
    return got;
  },
  winBoss(){
    if(!this.active) return null;
    const at = this.dest;
    const got = this.bank(1, 0);
    Player.ms = Player.maxMs;            /* the only healing in the layer */
    this.finish(at);
    return got;
  },
  defeat(){
    if(!this.active) return null;
    const got = this.bank(RULES.defeatKeepPct != null ? RULES.defeatKeepPct : 0.1,
                          RULES.itemLossOnDefeat != null ? RULES.itemLossOnDefeat : 0.9);
    this.finish(this.from);              /* thrown back to where you started */
    return got;
  },
  finish(dockAt){
    this.active = false;
    this.legs = []; this.leg = 0;
    Player.at = dockAt || Player.at;
    Player.inTrip = null;
    Player.save();
  },

  /* ---- advancing ---- */
  /* Called when the train has pulled into a platform. Returns what should
     happen next, which journey.js turns into a phase. */
  arrived(){
    if(!this.active) return "MAP";
    if(this.isLastLeg()) return "BOSS";       /* the destination — GDD 5, choice C */
    return "DILEMMA";
  },
  continueTrip(){
    if(!this.active) return false;
    this.leg++;
    startLeg();
    return true;
  }
};

/* A run interrupted by closing the browser resolves as a defeat (GDD 6). */
function resolveInterrupted(trip){
  if(!trip) return null;
  Run.active = true; Run.from = trip.from; Run.dest = trip.dest;
  Run.vault = Run.emptyVault();
  if(trip.crystals) Object.keys(trip.crystals).forEach(k => {
    if(Run.vault.crystals[k] != null) Run.vault.crystals[k] = trip.crystals[k] | 0;
  });
  if(Array.isArray(trip.items)) Run.vault.items = trip.items.slice();
  const got = Run.defeat();     /* the same 10% any other defeat would keep */
  return {from: trip.from, dest: trip.dest, got};
}
