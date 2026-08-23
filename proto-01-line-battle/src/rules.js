"use strict";
/* NEURO-METRO: AVUI — matchups and dry-run projection
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */

function matchup(layerEmotion, abilityEmotion){
  const L=layerEmotion||"NONE", A=abilityEmotion||"";
  let best=null;
  for(const m of MATCHUPS){
    if(m.enabled===false) continue;
    if(m.attack_emotion!=="*" && m.attack_emotion!==A) continue;
    if(m.layer_emotion !=="*" && m.layer_emotion !==L) continue;
    if(!best || m.priority>best.priority) best=m;
  }
  if(!best) return {dmg:RULES.noLayerDmgMult, ec:RULES.noLayerEcMult,
                    label:"OFF TYPE", cls:"off", sound:"hit"};
  return {dmg:best.dmg_mult, ec:best.ec_mult, label:best.label,
          cls:best.tag_class||"off", sound:best.sound||"hit"};
}
const ecFrom=(ab,dealt,m)=>Math.round((RULES.ecBasis==="POWER"?ab.power:dealt)*m.ec);

/* Dry-run a line without touching the real units. Every ability kind supplies
   its own projection (see kinds.js), so a new kind shows up in the build
   preview and in the AI's reasoning without this function changing.
   Returns scratch copies: {actor, defender}.                               */
function scratch(u){
  return {ms:u.ms, ec:u.ec, shield:u.shield, msMax:u.maxMs, layers:u.layers.map(l=>l.e)};
}
function simulate(line, actor, defender){
  const A=scratch(actor), D=scratch(defender);
  for(const entry of execOrder(line)){
    if(entry.charge) continue;                    // charge segments only hold
    Kinds.get(entry.ab.kind).project({A, D, ab:entry.ab});
  }
  return {actor:A, defender:D};
}
