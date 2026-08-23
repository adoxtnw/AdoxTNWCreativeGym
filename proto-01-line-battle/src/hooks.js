"use strict";
/* NEURO-METRO: AVUI — event bus
   Attachment points for mechanics that cut across the turn loop (statuses,
   synergies, passives) so they can be added without editing battle.js.

   Hooks.on("damage:dealt", ({attacker,defender,amount}) => { ... });

   emit() awaits each listener in turn, so a listener may animate or sleep.
   Listeners must not throw; one that does will abort the turn. */

const Hooks = (() => {
  const map = {};
  return {
    on(event, fn){ (map[event] = map[event] || []).push(fn); return fn; },
    off(event, fn){
      const a = map[event]; if(!a) return;
      const i = a.indexOf(fn); if(i >= 0) a.splice(i, 1);
    },
    async emit(event, payload){
      for(const fn of (map[event] || [])){
        try { await fn(payload); }
        catch(err){ console.error(`hook ${event} failed:`, err); }
      }
      return payload;
    },
    /* Events fired by the engine — keep this list current, it is the contract.
         battle:start   {}
         round:start    {round}
         round:end      {round}
         line:depart    {unit, cost}
         station:fire   {unit, entry, index}
         charge:tick    {unit, step}
         damage:dealt   {attacker, defender, ability, amount, matchup}
         layer:broken   {unit, layer}
         layers:regrown {unit, count}
         unit:defeated  {unit, byPlayer}                                     */
    EVENTS: ["battle:start","round:start","round:end","line:depart","station:fire",
             "charge:tick","damage:dealt","layer:broken","layers:regrown","unit:defeated"]
  };
})();
