"use strict";
/* NEURO-METRO: AVUI — units, line slots, layer queue
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */

/* ================= STATE ================= */
/* ---------- loadouts ----------
   A Loadout is one emotion's set of ability slots. The player carries
   `equippedSlots` of them; a unit with none (the enemy) keeps its flat `pool`
   column and nothing about its behaviour changes.

   Slots are POSITIONAL: `slot3` empty is a real, visible gap in the panel, not a
   missing entry, so this always returns exactly `loadoutSlots` cells. */
function loadoutSlotList(loadoutId){
  const lo = LOADOUTS[loadoutId];
  const out = [];
  for(let i=1; i<=RULES.loadoutSlots; i++){
    const abId = lo ? lo["slot"+i] : "";
    out.push(abId ? (ABILITIES[abId] || null) : null);
  }
  return out;
}
/* An ability may belong to SEVERAL emotions. `emotions` is blank for every ability
   today, meaning "just my own emotion" — the column exists so a hybrid can be added
   as a row edit, and it may then sit in a Loadout of any of its emotions. */
const emotionsOf = a => (a && a.emotions && a.emotions.length) ? a.emotions
                      : (a && a.emotion ? [a.emotion] : []);
const abilityFitsLoadout = (a, emotion) => emotionsOf(a).includes(emotion);

const isActionAb = a => !!(a && a.action);
const allActions = () => Object.values(ABILITIES).filter(a => a.enabled && isActionAb(a));

/* Actions are always available whatever is equipped, because they are always on
   screen. Everything else comes from the equipped Loadouts. */
function poolFrom(loadoutIds){
  const seen = new Set(), out = [];
  for(const a of allActions()){ if(!seen.has(a.id)){ seen.add(a.id); out.push(a); } }
  for(const id of loadoutIds)
    for(const a of loadoutSlotList(id))
      if(a && !seen.has(a.id)){ seen.add(a.id); out.push(a); }
  return out;
}

function makeUnit(id){
  const r=UNITS[id];
  return {id, name:r.name, emotion:r.emotion, maxMs:r.max_ms, ms:r.max_ms,
    ec:Math.round(r.max_ms*r.start_ec_pct), shield:0,
    layers:r.layers.slice(0,RULES.maxLayers).map((e,i)=>({e,pos:i,flash:0})),
    loadouts:(r.loadouts||[]).slice(0, RULES.equippedSlots),
    /* With Loadouts the pool is DERIVED from them; without, the flat column stands. */
    pool:(r.loadouts && r.loadouts.length)
         ? poolFrom(r.loadouts.slice(0, RULES.equippedSlots))
         : r.pool.map(a=>ABILITIES[a]).filter(Boolean),
    line:Array(r.line_cap || RULES.lineCap).fill(null), broken:[], overloaded:false,
    /* One entry per slot past `lineCap`, naming what KIND it is. Two kinds exist:
       OVERLOAD (forced on you, locked, drawn in the opponent's colour) and CRIT
       (earned by a critical, free to fill, gone after one turn). */
    extra:[],
    /* Per-unit line sizing: how many permanent slots, and the ceiling on the
       temporary ones the opponent's charging can buy. */
    lineCap:(r.line_cap || RULES.lineCap),
    /* `used[abilityId]` is how many of an ability's shots are already spent.
       Shots CARRY OVER between turns — the pool only refills once the ability
       has been emptied and served its cooldown. */
    used:{}, statuses:{}, statusSource:{}, stunned:0, critFresh:false,
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
const slotKind = (u, i) => i < u.lineCap ? "NORMAL" : (u.extra[i - u.lineCap] || "NORMAL");
function lineLen(u){ return u.lineCap + u.extra.length; }
/* Add slots of a kind, never past the hard cap. */
function addExtra(u, kind, n){
  for(let i=0; i<n && u.extra.length < RULES.maxExtraSlots; i++) u.extra.push(kind);
}
const dropExtra = (u, kind) => { u.extra = u.extra.filter(k => k !== kind); };
function clearLine(u){ u.line=Array(lineLen(u)).fill(null); u.cursor=0; }

/* Charging is no longer an interrupt — holding on a charge segment instead hands
   the OPPONENT room to act. Every charge segment in a line grants one temporary
   slot, which lasts exactly one turn: this is recomputed from scratch each round,
   so last round's grant simply stops being renewed. */
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

/* ---------- the future equip hook ----------
   Nothing calls this yet. It is the single seam an equip screen will use: swap one
   carried Loadout, rebuild the derived pool, redraw. `buildPanel()` and
   `renderLoadoutBar()` are deliberately safe to call again (their gesture wiring
   lives in `wirePanelGestures()`, which runs once), so this cannot stack listeners. */
function equipLoadout(u, slotIndex, loadoutId){
  if(slotIndex < 0 || slotIndex >= RULES.equippedSlots) return false;
  if(!LOADOUTS[loadoutId]) return false;
  u.loadouts[slotIndex] = loadoutId;
  u.pool = poolFrom(u.loadouts);
  if(u === S.player && typeof buildPanel === "function"){ buildPanel(); render(); }
  return true;
}

/* ---------- statuses ----------
   `unit.statuses` is {statusId: roundsLeft}. The row in the status_effects sheet
   says what a status DOES; nothing here knows about any particular one, so adding
   a status is adding a row plus whatever reads its column. */
const hasStatus = (u, id) => (u.statuses[id] || 0) > 0;
const statusRow = id => STATUSES[id];
function applyStatus(u, id, turns, sourceName){
  if(!id || !STATUSES[id]) return null;
  const n = turns || STATUSES[id].duration || 1;
  u.statuses[id] = Math.max(u.statuses[id] || 0, n);    // REFRESH, never stack
  /* The tag shows the ABILITY that did this, not the emotion — "SELF-HARM" tells
     you what hit you; "SAD" only tells you what colour it was. */
  if(sourceName) u.statusSource[id] = sourceName;
  return STATUSES[id];
}
function tickStatuses(u){
  for(const k in u.statuses) if(--u.statuses[k] <= 0) delete u.statuses[k];
}
/* How many broken layers a status is currently holding down. */
function regenBlocked(u){
  let n = 0;
  for(const k in u.statuses) if(u.statuses[k] > 0 && STATUSES[k]) n += (STATUSES[k].block_regen || 0);
  return n;
}
/* How much active statuses shift this unit's crit odds, summed like every other
   status reader — so a future buff or debuff only has to fill in `crit_mult`. */
function critBonus(u){
  let m = 0;
  for(const k in u.statuses) if(u.statuses[k] > 0 && STATUSES[k]) m += (STATUSES[k].crit_mult || 0);
  return m;
}
/* Fraction of this unit's attacks that miss outright. */
function missChance(u){
  let m = 0;
  for(const k in u.statuses) if(u.statuses[k] > 0 && STATUSES[k]) m = Math.max(m, STATUSES[k].miss_chance || 0);
  return m;
}

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
/* OVERLOAD: charge past the ceiling and the line is invaded.
   The forced stations are APPENDED so you can see them arrive at the end of your
   own line, and they are all of ONE kind — turning on yourself, or feeding the
   opponent, never a mix of the two. Rebuilt from scratch each turn: its previous
   slots are dropped first, or they would pile up every round. */
function applyOverload(u){
  dropExtra(u, "OVERLOAD");                       // clear last turn's before measuring
  u.line = u.line.slice(0, lineLen(u));
  u.overloaded = u.ec > u.ms;
  if(!u.overloaded) return 0;

  const over = u.ec - u.ms;
  const want = Math.max(1, Math.ceil(over / (RULES.overloadSlotPer * u.maxMs)));
  const before = u.extra.length;
  addExtra(u, "OVERLOAD", want);
  const n = u.extra.length - before;
  if(!n) return 0;

  /* one ability for the whole event, never a mix */
  const pool = [ABILITIES.SELF_HARM, ABILITIES.FEED].filter(Boolean);
  const ab = pool[Math.floor(Math.random() * pool.length)];
  while(u.line.length < lineLen(u)) u.line.push(null);
  for(let i = u.lineCap; i < lineLen(u); i++)
    if(u.extra[i - u.lineCap] === "OVERLOAD")
      u.line[i] = {ab, charge:false, locked:true};
  return n;
}
/* Overload is DERIVED, never stored in `unit.statuses` — tickStatuses() decrements
   every entry it finds, so a status kept there would tick itself away. */
const isOverloaded = u => u.ec > u.ms;

/* Interactions come entirely from the matchups table. '*' is a wildcard and
   'NONE' means the target has no layers; highest priority wins, so a specific
   pairing always beats a wildcard. Adding a synergy is adding a row.      */
