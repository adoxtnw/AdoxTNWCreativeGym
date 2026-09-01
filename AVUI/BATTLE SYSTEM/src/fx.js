"use strict";
/* NEURO-METRO: AVUI — tags, strikes, shakes, breakage
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */

let tagRow=0;
function bigTag(txt,cls){
  const el=document.createElement("div");
  el.className="bigtag pxr "+(cls||""); el.textContent=txt;
  el.style.top=`calc(40% + ${tagRow*50}px)`;
  tagRow++; setTimeout(()=>{tagRow=Math.max(0,tagRow-1);},760);
  $("screen").appendChild(el); setTimeout(()=>el.remove(),960);
}
async function flyStrike(stationEl,targetEl,col){
  if(!stationEl||!targetEl) return;
  const sr=$("screen").getBoundingClientRect();
  let a=stationEl.getBoundingClientRect();
  /* Launch from the MIDDLE OF THE LINE, not from wherever the station's rect
     happens to be. The station is centred by construction before it fires, but its
     rect depends on the slide transition having visually settled — read a frame
     early, or with transitions suppressed, and the symbol flew in from off the
     side of the bar. The lane's centre is the same point and is always true. */
  const lane=stationEl.closest(".lane");
  if(lane){
    const lr=lane.getBoundingClientRect();
    a={left:lr.left+lr.width/2-a.width/2, top:lr.top+lr.height/2-a.height/2,
       width:a.width, height:a.height};
  }
  const b=targetEl.getBoundingClientRect();
  const el=document.createElement("div");
  el.className="flyer"; el.innerHTML=stationEl.innerHTML;
  el.style.cssText=`left:${a.left-sr.left}px;top:${a.top-sr.top}px;width:${a.width}px;height:${a.height}px;color:${col}`;
  $("screen").appendChild(el);
  const dx=(b.left+b.width/2)-(a.left+a.width/2), dy=(b.top+b.height/2)-(a.top+a.height/2);
  sfx("travel");
  await waitAnim(el.animate([
    {transform:"translate(0,0) scale(1)"},
    {transform:`translate(${dx*0.34}px,${dy*0.34}px) scale(2.4)`, offset:.6},
    {transform:`translate(${dx}px,${dy}px) scale(1.15)`}
  ],{duration:RULES.flyMs, easing:"cubic-bezier(.45,0,.9,.45)"}), RULES.flyMs);
  el.remove();
}
function shieldBreak(hostEl){
  const sr=$("screen").getBoundingClientRect(), b=hostEl.getBoundingClientRect();
  for(let i=0;i<2;i++){
    const el=document.createElement("div");
    el.className="shbreak";
    el.innerHTML=`<svg viewBox="0 0 8 8" shape-rendering="crispEdges">${iconSVG("SHIELD")}</svg>`;
    el.style.left=(b.left-sr.left+b.width/2-13)+"px";
    el.style.top=(b.top-sr.top+b.height/2-13)+"px";
    el.style.clipPath = i===0 ? "polygon(0 0,50% 0,50% 100%,0 100%)" : "polygon(50% 0,100% 0,100% 100%,50% 100%)";
    $("screen").appendChild(el);
    const dir=i===0?-1:1;
    el.animate([
      {transform:"translate(0,0) rotate(0deg)", opacity:1},
      {transform:`translate(${dir*34}px,52px) rotate(${dir*70}deg)`, opacity:0}
    ],{duration:620, easing:"cubic-bezier(.3,.1,.7,1)", fill:"forwards"});
    setTimeout(()=>el.remove(),660);
  }
}
function gaugeHurt(onEnemy){
  const w=onEnemy?$("eWrap"):$("pWrap");
  w.classList.remove("hurt"); void w.offsetWidth; w.classList.add("hurt");
  (onEnemy?S.enemy:S.player).hurtFlash=5;      // the ceiling cap flashes white
  setTimeout(()=>w.classList.remove("hurt"),620);
}
/* ================= DEFERRED HITS =================
   A hit changes the ledger immediately (so the rules stay correct) but only
   posts an indicator; the bar keeps showing its old value. settle() then walks
   the indicators onto the bar one at a time — each morphs into a ball of light,
   arcs across, and the bar moves, shakes and sparks as it lands. */
const ACCENT = u => (u===S.player ? "#b0ffe1" : "#ffc2cd");

/* Indicators gather around the layers they came from — the enemy's over its
   rings, the player's over the arc rising behind the interface — drifting
   until the line is done. */
/* Layout box, walked with offset* rather than getBoundingClientRect().  The enemy
   sprite is permanently mid-transform (entrance scale + the idle float), and a
   client rect hands back that transient box -- which is how the indicators ended
   up bunched into a 55x31 patch below the sprite instead of spread over it. */
function zoneBox(el){
  let x = 0, y = 0, n = el; const stop = $("screen");
  while(n && n !== stop){ x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/* ================= FLOATING NUMBERS =================
   Damage and charge are applied THE MOMENT THEY LAND — no accumulating tag, no
   ball of light, no deferred settlement. What is left is the readout: a bare
   number thrown up beside the fighter, beat-'em-up style.

   MS goes up the RIGHT of the layers, EC up the LEFT, so the two never queue for
   the same space and you learn where to look. Size scales with the hit as a
   fraction of that fighter's whole stamina bar, so a big hit simply looks big.
   Overlap is fine and expected. */
function floatNum(u, kind, amount){
  if(!amount) return;
  const zone = zoneBox(u===S.player ? $("pstrip") : document.querySelector(".sprwrap"));
  const el = document.createElement("div");
  el.className = `fnum ${kind==="EC" ? "ec" : (u===S.player ? "ms-p" : "ms-e")}`;
  el.textContent = (amount>0 ? "+" : "\u2212") + Math.abs(amount);

  const f = Math.min(1, Math.abs(amount) / Math.max(1, u.maxMs));
  el.style.setProperty("--fs", (RULES.fnumMinPx + (RULES.fnumMaxPx - RULES.fnumMinPx) * f).toFixed(1) + "px");
  el.style.setProperty("--rise", (RULES.fnumRisePx + Math.round(f * 26)) + "px");

  /* Bands measured from the SCREEN, not from the zone. The enemy's zone is its
     186px sprite, but the player's is the full-width layer strip — so "just outside
     the zone" threw every player number off the edge of the phone entirely. */
  const right = kind !== "EC";
  const W = $("screen").offsetWidth;
  const band = right ? [0.70, 0.95] : [0.05, 0.30];
  el.style.left = Math.round(W * (band[0] + Math.random() * (band[1] - band[0]))) + "px";
  el.style.top  = Math.round(zone.y + zone.h * (0.18 + Math.random() * 0.6)) + "px";
  el.style.setProperty("--drift", Math.round(Math.random()*18 - 9) + "px");
  el.style.setProperty("--in",   RULES.fnumInMs   + "ms");
  el.style.setProperty("--hold", (RULES.fnumHoldMs + RULES.fnumLingerMs) + "ms");
  el.style.setProperty("--out",  RULES.fnumOutMs  + "ms");

  $("screen").appendChild(el);
  setTimeout(() => el.remove(),
    RULES.fnumInMs + RULES.fnumHoldMs + RULES.fnumLingerMs + RULES.fnumOutMs + 120);
}

/* A hit lands: the ledger already moved, so this is purely the reaction. */
function hitFeedback(u, kind, amount){
  floatNum(u, kind, amount);
  u.shownMs = u.ms; u.shownEc = u.ec;      // the bar keeps no secrets any more
  sfx(amount < 0 ? "hit" : "absorb");
  gaugeHurt(u === S.enemy);
  renderStats();
}

/* Kept so callers read the same, but nothing is deferred now. */
function queueDelta(u, kind, amount){ hitFeedback(u, kind, amount); }
async function settle(u){ u.shownMs=u.ms; u.shownEc=u.ec; renderStats(); await checkOverload(u); }
async function settleAll(){ await settle(S.enemy); await settle(S.player); }

/* ---- OVERLOAD: charge past the ceiling, and the container starts to fail ---- */
async function checkOverload(u){
  const over = u.shownEc > u.shownMs;
  const panel = $(u===S.player ? "pPanel" : "ePanel");
  panel.classList.toggle("overloaded", over);
  if(over && !u.overloadShown){
    u.overloadShown = true;
    bigTag("OVERLOAD!", "overload");
    sfx("breaklayer");
    setFps(3); $("screen").classList.add("slowmo");        // everything drags
    const el=$("screen");
    el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
    await sleep(RULES.overloadHoldMs);
    el.classList.remove("shake");
    $("screen").classList.remove("slowmo"); setFps(12);
  }
  if(!over) u.overloadShown = false;
}

async function impact(onEnemy){
  frozen=true; $("flash").classList.add("on"); await sleep(RULES.impactFlashMs);
  frozen=false; $("flash").classList.remove("on");
  const el=onEnemy?$("stage"):$("screen");
  el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
  await sleep(RULES.impactShakeMs); el.classList.remove("shake");
}
/* Paced layer break: flash → vanish (the rest ease outward) → beat → regrow
   from the centre at the back of the queue.                                */
/* A struck layer flashes, then is gone for the rest of the round. Everything
   behind it eases outward. Broken layers return in regrowLayers().        */
/* The temporary slots the opponent's charging just bought arrive one at a time,
   flying in from that opponent's side of the screen — otherwise they simply
   appear between turns and there is nothing to say where they came from. */
async function announceBonusSlots(){
  for(const [u, trackId] of [[S.enemy,"eTrack"], [S.player,"pTrack"]]){
    if(!u.extra.length) continue;
    const els = [...$(trackId).querySelectorAll(".station.bonus")];
    if(!els.length) continue;
    /* they come FROM the opponent: the player's arrive from above (the enemy's
       side), the enemy's from below (yours). */
    const dy = (u === S.player ? -1 : 1) * 130;
    for(const el of els){
      el.style.setProperty("--ay", dy + "px");
      el.style.setProperty("--ax", Math.round(Math.random()*40 - 20) + "px");
      el.classList.remove("arriving"); void el.offsetWidth; el.classList.add("arriving");
      sfx("slot");
      await sleep(RULES.slotArriveMs);
    }
  }
}

/* A layer shrugging off its own emotion: a big tag in that layer's colour, shaking
   sideways, over two descending notes. */
function resistTag(emotion){
  const el=document.createElement("div");
  el.className="bigtag resist pxr";
  el.textContent="RESISTED";
  el.style.background=emoHex(emotion);
  /* Over the fighter that shrugged it off, sat a little below its centre so the
     rings stay readable behind it. */
  const zone=zoneBox(document.querySelector(".sprwrap"));
  el.style.top=Math.round(zone.y + zone.h*0.62)+"px";
  $("screen").appendChild(el);
  setTimeout(()=>el.remove(),760);
  sfxAt(SOUNDS.resist, 1);
  setTimeout(()=>sfxAt(SOUNDS.resist, 0.72), 110);   // the second, lower note
}

async function breakLayer(u){
  if(!u.layers.length) return;
  const l=u.layers[0];
  l.flash=Math.ceil(RULES.layerFlashMs/(1000/12))+1;
  sfx("breaklayer");
  await sleep(RULES.layerFlashMs);
  u.layers.shift();
  /* Grown layers are temporary: they are simply gone, never filed for regrowth. */
  if(!l.temp) u.broken.push(l);
  /* Stripped to nothing: the unit reels. It skips its next line entirely and
     regrows nothing that turn, which is what makes stripping worth doing. */
  if(!u.layers.length){
    u.stunned = RULES.stunTurns;
    bigTag("STUNNED", "overload"); sfx("clash");
  }
  await Hooks.emit("layer:broken",{unit:u,layer:l});
  await sleep(RULES.layerGapMs);
}
async function regrowLayers(u){
  if(u.stunned > 0){ return; }        // reeling: nothing comes back this turn
  if(!u.broken.length) return;
  /* A status may be holding some of them down — those stay in `broken` and get
     another chance next round, once it has worn off. */
  const held = Math.min(regenBlocked(u), u.broken.length);
  const back = u.broken.splice(0, u.broken.length - held);
  if(!back.length){ bigTag("ROTTING", "off"); await sleep(RULES.layerGapMs); return; }
  for(const l of back){ l.flash=0; l.pos=RULES.maxLayers; u.layers.push(l); }
  const count=back.length;
  await Hooks.emit("layers:regrown",{unit:u,count});
  sfx("regrow");
  await sleep(RULES.layerRegrowMs);
}

/* ================= ABILITY EFFECTS =================
   What an ability LOOKS like when it lands, kept apart from what it DOES.

   Lookup is ability id -> kind -> default, so a bespoke effect for one ability is
   a single `AbilityFx.define("HVY_JOY", {...})` and nothing else moves. Effects are
   fire-and-forget: they never block the turn loop and never touch the ledger.

   Hooks: `hit` (an attack connects) and `apply` (a status or buff takes hold). */
const AbilityFx = (() => {
  const byId = {}, byKind = {}, base = {};
  const pick = (name, ctx) =>
    (byId[ctx.ab && ctx.ab.id] || {})[name] ||
    (byKind[ctx.ab && ctx.ab.kind] || {})[name] ||
    base[name];
  return {
    define(abilityId, spec){ byId[abilityId] = Object.assign(byId[abilityId] || {}, spec); },
    defineKind(kind, spec){ byKind[kind] = Object.assign(byKind[kind] || {}, spec); },
    defineDefault(spec){ Object.assign(base, spec); },
    play(name, ctx){ const f = pick(name, ctx); if(f) try{ f(ctx); }catch(_){} }
  };
})();

/* ---- where an effect should happen: the target's own body ---- */
function bodyBox(u){
  return zoneBox(u === S.player ? $("pstrip") : document.querySelector(".sprwrap"));
}

/* ---- shards: a few shapes of the attack's own emotion, thrown off the impact ---- */
function hitShards(emotion, u){
  const z = bodyBox(u), col = emoHex(emotion);
  const glyph = (EMOTIONS[emotion] || {}).icon || "BOLT";
  for(let i = 0; i < RULES.hitShards; i++){
    const el = document.createElement("div");
    el.className = "shard";
    el.innerHTML = `<svg viewBox="0 0 8 8" shape-rendering="crispEdges">${iconSVG(glyph)}</svg>`;
    const sz = 22 + Math.random() * 40;
    el.style.cssText =
      `left:${Math.round(z.x + z.w * (0.15 + Math.random()*0.7))}px;` +
      `top:${Math.round(z.y + z.h * (0.15 + Math.random()*0.7))}px;` +
      `width:${Math.round(sz)}px;height:${Math.round(sz)}px;color:${col};` +
      `--rot:${Math.round(Math.random()*70 - 35)}deg;--dl:${i*40}ms`;
    $("screen").appendChild(el);
    setTimeout(() => el.remove(), RULES.hitShardMs + i*40 + 120);
  }
}

/* ---- action lines: streaks over the target, up for a lift, down for a drag ---- */
function actionLines(u, up){
  const z = bodyBox(u);
  const wrap = document.createElement("div");
  wrap.className = "actionlines " + (up ? "up" : "down");
  wrap.style.cssText = `left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px`;
  let bars = "";
  for(let i = 0; i < 7; i++)
    bars += `<i style="left:${Math.round(6 + Math.random()*88)}%;` +
            `--dl:${Math.round(Math.random()*180)}ms;` +
            `--h:${Math.round(30 + Math.random()*45)}%"></i>`;
  wrap.innerHTML = bars;
  $("screen").appendChild(wrap);
  sfx(up ? "buff_up" : "debuff_down");
  setTimeout(() => wrap.remove(), RULES.actionLineMs + 260);
}

/* ---- a status taking hold: the body distorts, a bloom swells behind it, and the
        name of the ABILITY that did it flies to where its tag will sit ---- */
function statusFx(u, st, label){
  const z = bodyBox(u), host = u === S.player ? $("pstrip") : document.querySelector(".sprwrap");
  host.style.setProperty("--wt", RULES.statusFxMs + "ms");
  host.classList.remove("warp"); void host.offsetWidth; host.classList.add("warp");
  setTimeout(() => host.classList.remove("warp"), RULES.statusFxMs);

  const bloom = document.createElement("div");
  bloom.className = "statusbloom";
  bloom.style.cssText = `left:${z.x + z.w/2}px;top:${z.y + z.h/2}px;color:${st.color}`;
  $("screen").appendChild(bloom);
  setTimeout(() => bloom.remove(), RULES.statusFxMs + 200);

  const fly = document.createElement("div");
  fly.className = "statusname pxr";
  fly.textContent = label.toUpperCase();
  fly.style.cssText = `left:${z.x + z.w/2}px;top:${z.y + z.h*0.5}px;background:${st.color}`;
  $("screen").appendChild(fly);
  /* travel to the row this status will live in, then hand over to the real tag */
  const row = $(u === S.player ? "pStatus" : "eStatus").getBoundingClientRect();
  const sr = $("screen").getBoundingClientRect();
  requestAnimationFrame(() => {
    fly.style.transition = `transform ${RULES.statusFxMs*0.55}ms steps(7)`;
    fly.style.transform =
      `translate(-50%,-50%) translate(${Math.round((row.left + row.width/2) - sr.left - (z.x + z.w/2))}px,` +
      `${Math.round((row.top + row.height/2) - sr.top - (z.y + z.h*0.5))}px) scale(.72)`;
  });
  setTimeout(() => fly.remove(), RULES.statusFxMs);
  sfx("status_on");
}

/* ---- the defaults every ability gets unless it says otherwise ---- */
AbilityFx.defineDefault({
  hit({ab, target}){
    if(ab.emotion) sfx((EMOTIONS[ab.emotion] || {}).sfx || "hit");
    hitShards(ab.emotion || S.enemy.emotion, target);
  },
  apply({target, st, ab}){ statusFx(target, st, ab.name); }
});
/* A buff points its streaks up; anything hostile drags them down. */
AbilityFx.defineKind("CHARGE",  { hit({actor}){ actionLines(actor, true); } });
AbilityFx.defineKind("SHIELD",  { hit({actor}){ actionLines(actor, true); } });
AbilityFx.defineKind("ADDLAYER",{ hit({actor}){ actionLines(actor, true); } });
AbilityFx.defineKind("DEBUFF",  { apply(ctx){ actionLines(ctx.target, false); statusFx(ctx.target, ctx.st, ctx.ab.name); } });

/* ---- CRITICAL: thrown up somewhere around the impact, white, edged in the
        attack's own colour so you can tell whose it was ---- */
function criticalTag(u, emotion){
  const z = bodyBox(u);
  const el = document.createElement("div");
  el.className = "crittag pxr";
  el.textContent = "CRITICAL";
  el.style.cssText =
    `left:${Math.round(z.x + z.w * (0.2 + Math.random()*0.6))}px;` +
    `top:${Math.round(z.y + z.h * (0.15 + Math.random()*0.6))}px;` +
    `--emo:${emoHex(emotion)};--tilt:${Math.round(Math.random()*18 - 9)}deg;` +
    `--ct:${RULES.critHoldMs}ms`;
  $("screen").appendChild(el);
  return el;                                   // the sequence owns its lifetime now
}

/* One wash of the whole screen in the attacking emotion's colour. */
function flashColour(hex){
  const el = document.createElement("div");
  el.className = "colourflash";
  el.style.cssText = `background:${hex};--cf:${RULES.critFlashMs}ms`;
  $("screen").appendChild(el);
  setTimeout(() => el.remove(), RULES.critFlashMs + 80);
}

/* The earned slot travels from the CRITICAL tag to the end of the attacker's line,
   so the reward is visibly connected to the thing that caused it. A ghost, not the
   real station: re-rendering the track mid-resolution would destroy the very
   elements `resolveLine` is holding on to. The real slot arrives next build. */
async function flySlotToLine(fromEl, attacker, col){
  const sr = $("screen").getBoundingClientRect();
  const lane = $(attacker === S.player ? "pLane" : "eLane");
  if(!fromEl || !lane) return;
  const a = fromEl.getBoundingClientRect(), lr = lane.getBoundingClientRect();

  const el = document.createElement("div");
  el.className = "critslot";
  el.innerHTML = `<svg viewBox="0 0 8 8" shape-rendering="crispEdges">${stationSVG(null)}</svg>`;
  el.style.cssText = `left:${a.left - sr.left + a.width/2}px;` +
                     `top:${a.top - sr.top + a.height/2}px;color:${col}`;
  $("screen").appendChild(el);

  /* aim at the end of the line the attacker travels toward */
  const tx = (attacker.dir > 0 ? lr.right - 22 : lr.left + 22) - sr.left;
  const ty = lr.top + lr.height/2 - sr.top;
  const ms = RULES.critSlotFlyMs;
  await waitAnim(el.animate([
    {transform:"translate(-50%,-50%) scale(.5) rotate(0deg)", opacity:0},
    {transform:"translate(-50%,-50%) scale(1.5) rotate(120deg)", opacity:1, offset:.25},
    {transform:`translate(calc(-50% + ${Math.round(tx - (a.left - sr.left + a.width/2))}px),`+
               `calc(-50% + ${Math.round(ty - (a.top - sr.top + a.height/2))}px))`+
               ` scale(1) rotate(360deg)`, opacity:1}
  ], {duration:ms, easing:"steps(12)", fill:"forwards"}), ms);
  sfx("place");
  lane.classList.add("alert"); await sleep(90); lane.classList.remove("alert");
  el.remove();
}

/* The whole critical beat, awaited by the attack that caused it — nothing else
   happens until the slot has landed. */
async function criticalSequence(attacker, target, emotion){
  const col = emoHex(emotion);
  const tag = criticalTag(target, emotion);
  flashColour(col);
  await sleep(RULES.critHoldMs);
  /* HOW MANY SLOTS A CRITICAL IS WORTH is a rule, not a constant. It was a
     hard-coded 1, which meant the Set of Rush — whose whole idea is that a
     critical is worth three — had nowhere to say so. `critSlots` is the number
     for everybody; PAS_RUSH swaps it for `rushCritSlots`.

     `addExtra` stops at `maxExtraSlots` on its own, so three may land as fewer
     on a line that is already carrying Overload — which is correct: the ceiling
     on a line is a ceiling. Only the slots that were actually granted fly in. */
  const want = hasPassive(attacker, "PAS_RUSH")
    ? (RULES.rushCritSlots || 3) : (RULES.critSlots || 1);
  const before = attacker.extra.length;
  addExtra(attacker, "CRIT", want);
  const got = attacker.extra.length - before;
  attacker.critFresh = true;
  /* One flight each, in turn — three slots arriving at once is a flicker, and
     the whole point of the animation is that you can count them. */
  for(let i = 0; i < got; i++) await flySlotToLine(tag, attacker, col);
  tag.remove();
}

/* ---- a tag over ONE fighter, rather than centre screen ----
   Centre-screen tags cannot say who they are about. When both sides suffer the same
   thing in one round — two Sad units each turning on themselves — the two
   announcements read as one event fired twice. Placed on the body, they are
   obviously two. */
function unitTag(u, text, hex){
  const z = bodyBox(u);
  const el = document.createElement("div");
  el.className = "crittag pxr unittag";
  el.textContent = text;
  el.style.cssText =
    `left:${Math.round(z.x + z.w * 0.5)}px;` +
    `top:${Math.round(z.y + z.h * (0.3 + Math.random()*0.3))}px;` +
    `--emo:${hex || "#ffffff"};--tilt:${Math.round(Math.random()*10 - 5)}deg`;
  $("screen").appendChild(el);
  setTimeout(() => el.remove(), RULES.critTagMs + 120);
}

/* ---- self-harm reads as an attack that turns on you: the symbol travels most of
        the way to the opponent, thinks better of it, and comes back ---- */
async function boomerangStrike(stationEl, awayEl, backEl, col){
  if(!stationEl || !awayEl || !backEl) return;
  const sr = $("screen").getBoundingClientRect();
  let a = stationEl.getBoundingClientRect();
  const lane = stationEl.closest(".lane");
  if(lane){
    const lr = lane.getBoundingClientRect();
    a = {left:lr.left + lr.width/2 - a.width/2, top:lr.top + lr.height/2 - a.height/2,
         width:a.width, height:a.height};
  }
  const away = awayEl.getBoundingClientRect(), back = backEl.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "flyer"; el.innerHTML = stationEl.innerHTML;
  el.style.cssText = `left:${a.left - sr.left}px;top:${a.top - sr.top}px;` +
                     `width:${a.width}px;height:${a.height}px;color:${col}`;
  $("screen").appendChild(el);
  const to = (r, k) => [((r.left + r.width/2) - (a.left + a.width/2)) * k,
                        ((r.top + r.height/2) - (a.top + a.height/2)) * k];
  /* Nearly ALL the way out, then a clean snap home. The caster's own body sits only
     a little short of the opponent on this layout, so a timid overshoot made the two
     ends indistinguishable — the gesture only reads if the apex is committed and the
     return is one move, not a drift. */
  const [ax, ay] = to(away, 0.95);
  const [bx, by] = to(back, 1);
  sfx("travel");
  const ms = RULES.flyMs * 2.4;
  await waitAnim(el.animate([
    {transform:"translate(0,0) scale(1)", offset:0},
    {transform:`translate(${ax}px,${ay}px) scale(1.55)`, offset:.42},
    {transform:`translate(${ax}px,${ay}px) scale(1.15)`, offset:.58},   // hangs, refuses
    {transform:`translate(${bx}px,${by}px) scale(1.45)`, offset:1}      // and comes home
  ], {duration:ms, easing:"steps(16)"}), ms);
  el.remove();
}

/* Self-harm: the boomerang, and no shards on the way out. */
AbilityFx.define("SELF_HARM", {
  hit({actor}){ hitShards(S.enemy.emotion, actor); }
});
/* Healing lifts, in stamina mint. */
AbilityFx.defineKind("FEED", {
  hit({target}){ actionLines(target, true); }
});
