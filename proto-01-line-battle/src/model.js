"use strict";
/* NEURO-METRO: AVUI — units, line slots, layer queue
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */

/* ================= STATE ================= */
function makeUnit(id){
  const r=UNITS[id];
  return {id, name:r.name, emotion:r.emotion, maxMs:r.max_ms, ms:r.max_ms,
    ec:Math.round(r.max_ms*r.start_ec_pct), shield:0,
    layers:r.layers.slice(0,RULES.maxLayers).map((e,i)=>({e,pos:i,flash:0})),
    pool:r.pool.map(a=>ABILITIES[a]).filter(Boolean),
    line:Array(r.line_cap || RULES.lineCap).fill(null), broken:[], overloaded:false, bonusSlots:0,
    /* Per-unit line sizing: how many permanent slots, and the ceiling on the
       temporary ones the opponent's charging can buy. */
    lineCap:(r.line_cap || RULES.lineCap), maxBonus:(r.max_bonus_slots || RULES.maxBonusSlots),
    /* `used[abilityId]` is how many of an ability's shots are already spent.
       Shots CARRY OVER between turns — the pool only refills once the ability
       has been emptied and served its cooldown. */
    used:{},
    cooldowns:{}, cursor:0, hurtFlash:0, dir:r.line_dir||1,
    /* The bar renders shownMs/shownEc, not ms/ec. Hits land in `pending` during
       a line and are walked onto the bar afterwards, so the player can watch
       each one arrive instead of the bar twitching mid-resolution. */
    shownMs:r.max_ms, shownEc:Math.round(r.max_ms*r.start_ec_pct), pending:[], overloaded:false};
}
const S={phase:"BUILD", round:1, busy:false, saidWinning:false, saidLosing:false,
  player:makeUnit("player"), enemy:makeUnit("enemy")};

/* `unit.line` is stored in EXECUTION order — index 0 always fires first.
   Rendering, not the data, respects direction: a unit whose line travels right
   draws index 0 at the right-hand end; one travelling left draws it at the left.
   Every entry is {ab, charge}; charge segments only consume a slot and tick.  */
const execOrder   = line => line.filter(Boolean);
/* index 0 always fires first; a line travelling right draws index 0 on the right */
const visualIdx   = u => u.dir>0 ? [...u.line.keys()].reverse() : [...u.line.keys()];
const slotsUsed   = u => u.line.filter(Boolean).length;
const emptySlots  = u => u.line.filter(x=>!x).length;
function entriesFor(ab){
  const out=[];
  for(let i=0;i<(ab.charge||0);i++) out.push({ab, charge:true});
  out.push({ab, charge:false});
  return out;
}
/* charge segments must sit immediately before their ability, so a multi-slot
   ability needs that many consecutive free slots */
function placeEntries(u, ab){
  const need=(ab.charge||0)+1;
  for(let i=0;i<=u.line.length-need;i++){
    let ok=true;
    for(let k=0;k<need;k++) if(u.line[i+k]) { ok=false; break; }
    if(!ok) continue;
    entriesFor(ab).forEach((e,k)=>{ u.line[i+k]=e; });
    return true;
  }
  return false;
}
/* A line is `lineCap` permanent slots plus however many TEMPORARY slots the
   opponent's charging bought this unit.  The bonus slots are always the tail of
   the array, so `i >= RULES.lineCap` is the whole test for "this slot is
   temporary" — rendering and expiry both lean on that. */
const isBonusSlot = (u, i) => i >= u.lineCap;
function lineLen(u){ return u.lineCap + (u.bonusSlots||0); }
function clearLine(u){ u.line=Array(lineLen(u)).fill(null); u.cursor=0; }

/* Charging is no longer an interrupt — holding on a charge segment instead hands
   the OPPONENT room to act. Every charge segment in a line grants one temporary
   slot, which lasts exactly one turn: this is recomputed from scratch each round,
   so last round's grant simply stops being renewed. */
function grantBonusSlots(u, n){
  u.bonusSlots = RULES.chargeGrantsSlots ? Math.max(0, Math.min(u.maxBonus, n)) : 0;
}

/* ---------- shots ----------
   An ability can only be added to the line while it has shots left. Shots are NOT
   refilled each turn: whatever you do not spend is still there next turn. Emptying
   the pool is what starts the cooldown, and finishing the cooldown is what refills
   it (see tickCooldowns). Counting what is currently ON the line means pulling an
   ability back off the line hands its shot straight back, with no bookkeeping. */
const inLineCount = (u, ab) => u.line.filter(e => e && !e.charge && e.ab === ab).length;
function usesLeft(u, ab){
  if(!ab.uses) return Infinity;              // 0 = not shot-limited (overload stations)
  return Math.max(0, ab.uses - (u.used[ab.id] || 0) - inLineCount(u, ab));
}
/* Called once the line has actually departed: what was on it is now really spent. */
function commitUses(u){
  for(const e of u.line){
    if(!e || e.charge || !e.ab.uses || e.locked) continue;
    u.used[e.ab.id] = (u.used[e.ab.id] || 0) + 1;
  }
  for(const id of Object.keys(u.used)){
    const ab = ABILITIES[id];
    if(ab && u.used[id] >= ab.uses && !u.cooldowns[id])
      u.cooldowns[id] = (ab.cooldown || 0) + 1;   // emptied: NOW it goes on cooldown
  }
}
const chargeCount = u => u.line.filter(e => e && e.charge).length;

/* ---------- cooldowns ----------
   `cooldown` on an ability is how many WHOLE TURNS it must sit out. Cooldown is no
   longer stamped on every use — an ability only goes on cooldown once its SHOTS are
   exhausted (see commitUses). Every stamp ticks down once at the end of the round,
   so a cooldown of 1 means "not next turn, yes the turn after". */
const cooldownLeft=(u,id)=>u.cooldowns[id]||0;
function tickCooldowns(u){
  for(const k in u.cooldowns){
    if(--u.cooldowns[k] <= 0){
      delete u.cooldowns[k];
      u.used[k] = 0;            // served its cooldown: the shot pool refills
    }
  }
}

/* ---------- layer order ----------
   Re-shuffled every round so the same opening never works twice: which layer
   is outermost — and so which emotion is the profitable one to match — changes
   between turns for both sides. */
function shuffleLayers(u){
  if(!RULES.shuffleLayersEachRound || u.layers.length<2) return;
  for(let i=u.layers.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [u.layers[i],u.layers[j]]=[u.layers[j],u.layers[i]];
  }
  u.layers.forEach((l,i)=>{ l.pos=i; });     // snap, the ring wave re-settles
}
/* OVERLOAD: charge past the ceiling and the line is invaded by things you did
   not choose and cannot remove. */
function applyOverload(u){
  u.overloaded = u.ec > u.ms;
  if(!u.overloaded) return 0;
  const over=u.ec-u.ms;
  const n=Math.max(1, Math.min(u.line.length-1,
        Math.ceil(over/(RULES.overloadSlotPer*u.maxMs))));
  const idx=[...u.line.keys()];
  for(let i=idx.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [idx[i],idx[j]]=[idx[j],idx[i]]; }
  const pool=[ABILITIES.SELF_HARM, ABILITIES.FEED].filter(Boolean);
  let placed=0;
  for(const at of idx){
    if(placed>=n) break;
    if(u.line[at]) continue;
    u.line[at]={ab:pool[Math.floor(Math.random()*pool.length)], charge:false, locked:true};
    placed++;
  }
  return placed;
}

/* Interactions come entirely from the matchups table. '*' is a wildcard and
   'NONE' means the target has no layers; highest priority wins, so a specific
   pairing always beats a wildcard. Adding a synergy is adding a row.      */
