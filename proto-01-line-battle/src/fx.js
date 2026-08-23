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
  const a=stationEl.getBoundingClientRect(), b=targetEl.getBoundingClientRect();
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

/* ONE tag per unit per kind — not one per hit. A five-station line used to post
   five pills and the eye had nowhere to rest; now the MS tag and the EC tag each
   sit still and COUNT UP, growing and breathing harder as the running total
   approaches that unit's whole stamina bar. Scale and breathing rate are driven
   from |total| / maxMs, so the same hit reads as bigger on a frailer fighter. */
function tagStyle(el, u, total){
  const f = Math.min(1, Math.abs(total) / Math.max(1, u.maxMs));
  let sc = 1 + RULES.tagGrowth * f;
  /* A tag holding a whole stamina bar would otherwise be wider than the phone.
     offsetWidth is the untransformed layout width, so this reads the natural
     size and caps the scale rather than fighting it. */
  const maxW = $("screen").offsetWidth * 0.94, natural = el.offsetWidth;
  if(natural > 0 && natural * sc > maxW) sc = maxW / natural;
  el.style.setProperty("--sc", sc.toFixed(3));
  el.style.setProperty("--bd",
    Math.round(RULES.tagBreathSlowMs + (RULES.tagBreathFastMs - RULES.tagBreathSlowMs) * f) + "ms");
  el.style.setProperty("--gl", (0.5 + 2.2 * f).toFixed(2));
}

function queueDelta(u, kind, amount){
  if(!amount) return;
  let item = u.pending.find(i => i.kind === kind);

  if(item){                                   // fold into the tag already standing
    item.amount += amount;
    if(!item.amount){ item.el.remove(); u.pending.splice(u.pending.indexOf(item),1); return; }
    item.el.textContent = (item.amount>0?"+":"") + item.amount + " " + kind;
    tagStyle(item.el, u, item.amount);
    item.el.classList.remove("bump"); void item.el.offsetWidth; item.el.classList.add("bump");
    return;
  }

  /* Two tags at most, so they get fixed places rather than a scatter: stamina
     above the fighter, charge below it. */
  const zone = zoneBox(u===S.player ? $("pstrip") : document.querySelector(".sprwrap"));
  const el = document.createElement("div");
  el.className = `ind pxr ${kind==="EC" ? "ec" : (u===S.player ? "ms-p" : "ms-e")}`;
  el.textContent = (amount>0?"+":"") + amount + " " + kind;
  const cx = $("screen").offsetWidth / 2;
  const cy = zone.y + zone.h * (kind === "MS" ? 0.14 : 0.86);   // frame the fighter, not bury it
  el.style.left = cx + "px";
  el.style.top  = cy + "px";
  $("screen").appendChild(el);
  tagStyle(el, u, amount);          // after appending: offsetWidth needs layout
  u.pending.push({kind, amount, el, x:cx, y:cy});
}


function crash(cx, cy, kind, u){
  const cols = kind==="EC" ? Object.values(EMOTIONS).map(e=>e.hex) : [ACCENT(u), "#ffffff"];
  for(let i=0;i<14;i++){
    const p=document.createElement("div");
    p.className="crash";
    const sz=2+Math.floor(Math.random()*3)*2;
    p.style.cssText=`left:${cx}px;top:${cy}px;width:${sz}px;height:${sz}px;`+
                    `background:${cols[i%cols.length]}`;
    $("screen").appendChild(p);
    const a=Math.random()*Math.PI*2, sp=18+Math.random()*46;
    p.animate([{transform:"translate(-50%,-50%) scale(1)",opacity:1},
               {transform:`translate(calc(-50% + ${Math.cos(a)*sp}px), calc(-50% + ${Math.sin(a)*sp}px)) scale(.3)`,opacity:0}],
              {duration:420+Math.random()*260, easing:"cubic-bezier(.1,.8,.3,1)", fill:"forwards"});
    setTimeout(()=>p.remove(), 760);
  }
}

/* Every indicator turns to light at the same moment — then they stream into
   the bar one at a time so each change can be read. */
async function morphAll(u){
  if(!u.pending.length) return;
  for(const item of u.pending){
    item.el.style.animation="none";
    item.el.animate([{transform:"translate(-50%,-50%) scale(1)", borderRadius:"0"},
                     {transform:"translate(-50%,-50%) scale(.34)", borderRadius:"50%", opacity:.35}],
                    {duration:190, easing:"steps(4)", fill:"forwards"});
    const ball=document.createElement("div");
    ball.className="ball";
    ball.style.cssText=`left:${item.x}px;top:${item.y}px;`+
                       `color:${item.kind==="EC"?"#fcc336":ACCENT(u)}`;
    $("screen").appendChild(ball);
    item.ball=ball;
  }
  sfx("absorb");
  await sleep(230);
  u.pending.forEach(i=>i.el.remove());
}

/* one ball arcs into the bar */
async function flyDelta(u, item){
  /* layout box again -- the gauge may be mid-shake from the previous hit, and
     flights now overlap the tween, so a client rect could aim at a jittered target */
  const gauge=zoneBox($(u===S.player ? "pGauge" : "eGauge"));
  const x0=item.x, y0=item.y;
  const x1=gauge.x+gauge.w*(0.3+Math.random()*0.4);
  const y1=gauge.y+gauge.h/2;
  const ball=item.ball;
  const bow=Math.abs(y1-y0)*0.45 + 30;              // arc, rather than a straight line
  await waitAnim(ball.animate([
    {transform:"translate(-50%,-50%) scale(.6)"},
    {transform:`translate(calc(-50% + ${(x1-x0)*0.5}px), calc(-50% + ${(y1-y0)*0.5-bow}px)) scale(1.25)`, offset:.5},
    {transform:`translate(calc(-50% + ${x1-x0}px), calc(-50% + ${y1-y0}px)) scale(.85)`}
  ],{duration:RULES.ballFlyMs, easing:"cubic-bezier(.35,0,.7,1)", fill:"forwards"}), RULES.ballFlyMs);
  ball.remove();
  crash(x1, y1, item.kind, u);
}

/* walk every queued hit onto the bar, one at a time */
async function settle(u){
  if(!u.pending.length){ u.shownMs=u.ms; u.shownEc=u.ec; renderStats(); return; }
  await morphAll(u);
  while(u.pending.length){
    const item=u.pending.shift();
    await flyDelta(u, item);
    if(item.kind==="MS") tweenShown(u,"Ms",Math.max(0,Math.min(u.maxMs,u.shownMs+item.amount)));
    else                 tweenShown(u,"Ec",Math.max(0,u.shownEc+item.amount));
    sfx(item.amount<0 ? "hit" : "absorb");
    gaugeHurt(u===S.enemy);
    /* The bar gets its full second, but the next ball sets off during the tail
       of it — so each bar change still reads as a second without the flights
       stacking on top and doubling the wait. */
    await sleep(Math.max(0, RULES.barTweenMs - RULES.ballFlyMs));
    renderStats();
    await checkOverload(u);
    await sleep(RULES.settleStepMs);
  }
  u.shownMs=u.ms; u.shownEc=u.ec; renderStats();   // snap, in case of rounding
}
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
  frozen=true; $("flash").classList.add("on"); await sleep(95);
  frozen=false; $("flash").classList.remove("on");
  const el=onEnemy?$("stage"):$("screen");
  el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
  await sleep(270); el.classList.remove("shake");
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
    if(!u.bonusSlots) continue;
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

async function breakLayer(u){
  if(!u.layers.length) return;
  const l=u.layers[0];
  l.flash=Math.ceil(RULES.layerFlashMs/(1000/12))+1;
  sfx("breaklayer");
  await sleep(RULES.layerFlashMs);
  u.layers.shift();
  /* Grown layers are temporary: they are simply gone, never filed for regrowth. */
  if(!l.temp) u.broken.push(l);
  await Hooks.emit("layer:broken",{unit:u,layer:l});
  await sleep(RULES.layerGapMs);
}
async function regrowLayers(u){
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
