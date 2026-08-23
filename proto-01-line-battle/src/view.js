"use strict";
/* NEURO-METRO: AVUI — gauge, lanes and the ability panel
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */

/* ================= RENDER ================= */
function lineCost(u){return u.line.reduce((s,e)=>s+((e&&!e.charge)?e.ab.cost:0),0);}
const GCTX={};
function gaugeCtx(id){
  if(!GCTX[id]){
    const c=$(id); c.width=RULES.gaugeW; c.height=RULES.gaugeH;
    GCTX[id]=c.getContext("2d");
  }
  return GCTX[id];
}
/* The bar itself is drawn in src/gauge.js; what stays here is everything that
   is genuinely DOM — the value tags, their anchoring, and the overcharge state. */
function renderGauge(el,u,opts){
  const pct=v=>Math.max(0,Math.min(100,v/u.maxMs*100));
  const ctx=gaugeCtx(el.id), dctx=gaugeCtx(el.id+"Dead");
  drawGauge(ctx, dctx, u, opts);
  // hand the animation loop what it needs to keep repainting this bar
  GaugeView.targets = GaugeView.targets || {};
  GaugeView.targets[u===S.player?"p":"e"] = {ctx, dctx, opts};
  const anchor=(e,v)=>{
    const x=pct(v); e.style.left=x+"%";
    e.style.transform = x>86 ? "translateX(-100%)" : x<14 ? "translateX(0)" : "translateX(-50%)";
  };
  const sMs=u.shownMs!=null?u.shownMs:u.ms, sEc=u.shownEc!=null?u.shownEc:u.ec;
  opts.tagMs.textContent=sMs+" MS"; anchor(opts.tagMsA,sMs);
  opts.tagEc.textContent=sEc+" EC"; anchor(opts.tagEcA,Math.min(sEc,u.maxMs));
  opts.tagEc.classList.toggle("overcharged", sEc>sMs);   // NOT "over" — that is the game-over overlay
}

/* Shields ride the attack lines rather than sitting in the stat block, so the
   thing that will absorb the next hit is drawn on the thing that delivers it. */
function renderShields(){
  const put=(el,n)=>{
    el.innerHTML = Array.from({length:n},(_,i)=>
      `<div class="sh" style="--d:${(i*0.22).toFixed(2)}s">`+
      `<svg viewBox="0 0 8 8" shape-rendering="crispEdges">${iconSVG("SHIELD")}</svg></div>`).join("");
  };
  put($("pShields"), S.player.shield);
  put($("eShields"), S.enemy.shield);
}
/* Active statuses sit as small pixel tags against the unit they afflict — under
   the enemy's gauge, over yours — each showing the symbol of the ability that
   applied it and how many rounds are left. */
function renderStatuses(){
  for(const [u, id] of [[S.enemy,"eStatus"], [S.player,"pStatus"]]){
    const host = $(id); if(!host) continue;
    const keys = Object.keys(u.statuses).filter(k => u.statuses[k] > 0 && STATUSES[k]);
    host.innerHTML = keys.map(k => {
      const st = STATUSES[k];
      return `<div class="stag pxr" data-k="${k}" style="--sc2:${st.color}">`+
             `<svg viewBox="0 0 8 8" shape-rendering="crispEdges">${iconSVG(st.icon)}</svg>`+
             `<span>${st.name.toUpperCase()}</span><b>${u.statuses[k]}</b></div>`;
    }).join("");
    host.classList.toggle("on", keys.length > 0);
  }
}
function renderStats(){
  const p=S.player, e=S.enemy, building=S.phase==="BUILD";
  /* One dry run covers both bars, so abilities that act on the player — a
     Recharge, an Overload-forced Self Harm — preview on the player's own bar
     instead of only ever showing what happens to the enemy. */
  const sim = building ? simulate(p.line, p, e) : null;
  renderGauge($("pGauge"), p, {
    spend  : building ? lineCost(p) : 0,
    chargeTo: sim ? sim.actor.ec : p.ec,
    projMs : (sim && sim.actor.ms < p.ms) ? sim.actor.ms : null,
    tagMs:$("pTagMs"), tagEc:$("pTagEc"),
    tagMsA:$("pTagMsA"), tagEcA:$("pTagEcA")});
  renderGauge($("eGauge"), e, {
    spend  : 0,
    chargeTo: sim ? sim.defender.ec : e.ec,
    projMs : sim ? sim.defender.ms : null,
    tagMs:$("eTagMs"), tagEc:$("eTagEc"),
    tagMsA:$("eTagMsA"), tagEcA:$("eTagEcA")});
  renderShields();
  renderStatuses();
}
/* ghosts sit on the LEFT: taps prepend, so that is where the next one lands */
/* Draws the line in travel order. `dir > 0` means it moves right, so the
   first-to-fire entry sits at the RIGHT end behind the terminus arrow.      */
function trackHTML(unit,showGhosts){
  const order=visualIdx(unit), n=order.length, STEP=0.16;
  const seg=(i,vp)=>{
    // the wave always runs in the line's direction of travel
    const delay=(unit.dir>0 ? vp : (n-1-vp))*STEP;
    const e=unit.line[i];
    const bonus=isBonusSlot(unit, i) ? " bonus" : "";   // temporary, bought by the opponent's charging
    if(!e) return (showGhosts || bonus)
      ? `<div class="link dead"></div><div class="station ghost${bonus}" data-vp="${vp}"`+
        ` style="color:var(--line);--d:${delay.toFixed(2)}s">${stationSVG(null)}</div>`
      : "";
    const col=emoHex(e.ab.emotion);
    const cls="station"+(e.charge?" chg":"")+(e.locked?" locked":"")+bonus;
    const inner=e.charge?chargeSVG():stationSVG(e.ab.icon);
    return `<div class="link" style="color:${col}"></div>`+
           `<div class="${cls}" data-idx="${i}" style="color:${col};--d:${delay.toFixed(2)}s">${inner}</div>`;
  };
  const body=order.map((i,vp)=>seg(i,vp)).join("");
  const first=unit.line.find(Boolean);
  const headCol=first?emoHex(first.ab.emotion):"var(--line)";
  const arrow=`<div class="term${first?"":" dead"}" style="color:${headCol}"></div>`;
  return unit.dir>0 ? body+arrow : arrow+body;
}
function renderLines(){
  $("pTrack").innerHTML=trackHTML(S.player,S.phase==="BUILD");
  $("eTrack").innerHTML=S.enemy.line.length?trackHTML(S.enemy,false)
    :`<div class="station ghost" style="color:var(--line)">${stationSVG(null)}</div>`;
}
/* Typeless abilities (Defend, Recharge) would otherwise take emoHex's fallback,
   which is FEAR's grey — and read as an emotion they are not. In the panel they
   take the stamina mint instead. */
const abAccent = a => a.emotion ? emoHex(a.emotion) : "#b0ffe1";
function abilRowHTML(a){
  const col=abAccent(a);
  let line="";
  for(let i=0;i<(a.charge||0);i++)
    line+=`<div class="link" style="color:${col}"></div><div class="station chg" style="color:${col}">${chargeSVG()}</div>`;
  line+=`<div class="link" style="color:${col}"></div><div class="station" style="color:${col}">${stationSVG(a.icon)}</div>`;
  const dmg = a.kind==="DAMAGE" ? `<span class="pill wht pxr">${a.power} DMG</span>`
            : a.kind==="CHARGE" ? `<span class="pill wht pxr">+${a.power} EC</span>`+
                (a.self_ms?`<span class="pill wht pxr">-${a.self_ms} MS</span>`:``)
            : `<span class="pill wht pxr">BLOCK ${a.power}</span>`;
  /* Shots run down the LEFT EDGE as tiny dots in the ability's own colour; the
     cooldown veil covers the whole box and shows only the turns remaining. */
  const shots = a.uses ? `<div class="shots">`+
      Array.from({length:a.uses},(_,i)=>`<div class="shot" data-i="${i}"></div>`).join("")+
      `</div>` : "";
  const bob = ((a.id.length * 7) % 20) / 10;      // stable per-ability offset
  return `<div class="abrow pxr" data-a="${a.id}" style="--emo:${col};--fd:${bob}s">
      ${shots}
      <div class="cdveil"><span class="cdnum"></span></div>
      <div class="abline">${line}</div>
      <div class="abinfo">
        <div class="abname">${a.name.toUpperCase()}</div>
        <div class="pills">${a.cost>0?`<span class="pill rain pxr">-${a.cost} EC</span>`:``}${dmg}</div>
      </div></div>`;
}
/* ---------- the Emotions panel is paged, not scrolled ----------
   Four abilities to a page, swiped with a pointer so the same gesture works
   under a finger and under a mouse. Position is shown by dots; the triangles
   are only indicators that another page exists that way. */
let abPage = 0, abDragMoved = 0, abLongPressed = false;
const abPageCount = () => Math.max(1, Math.ceil(S.player.pool.length / RULES.abilPageSize));

function gotoPage(p, animate){
  const n = abPageCount();
  abPage = Math.max(0, Math.min(n - 1, p));
  const pages = $("abPages");
  pages.style.transition = animate === false ? "none" : "";
  pages.style.transform  = `translateX(${-abPage * 100}%)`;
  $("abDots").querySelectorAll(".abdot").forEach((d,i)=>d.classList.toggle("on", i===abPage));
  $("abPrev").classList.toggle("show", abPage > 0);
  $("abNext").classList.toggle("show", abPage < n - 1);
}

function buildPanel(){
  const size = RULES.abilPageSize, pool = S.player.pool, n = abPageCount();
  let html = "";
  for(let p = 0; p < n; p++)
    html += `<div class="abpage">${pool.slice(p*size, (p+1)*size).map(abilRowHTML).join("")}</div>`;
  $("abPages").innerHTML = html;
  $("abDots").innerHTML  = Array.from({length:n}, (_,i)=>`<div class="abdot" data-p="${i}"></div>`).join("");

  /* Long-press opens the ability's tooltip. It has to cooperate with the swipe:
     any movement past the drag threshold cancels the timer, and once the tooltip
     has opened the click that follows is swallowed so the press does not also
     place the ability. */
  $("abPages").querySelectorAll(".abrow").forEach(el=>{
    let held=null;
    const cancel = () => { if(held){ clearTimeout(held); held=null; } };
    el.addEventListener("pointerdown", () => {
      cancel();
      held = setTimeout(() => {
        held = null;
        if(abDragMoved > 8) return;             // it turned into a swipe
        abLongPressed = true;
        showTip(abilityTip(ABILITIES[el.dataset.a]), el);
      }, RULES.longPressMs);
    });
    el.addEventListener("pointermove", () => { if(abDragMoved > 8) cancel(); });
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", cancel);
  });

  $("abPages").querySelectorAll(".abrow").forEach(el=>el.addEventListener("click",()=>{
    if(S.phase!=="BUILD") return;
    if(abLongPressed){ abLongPressed=false; return; }   // that press opened a tooltip
    if(abDragMoved > 8) return;                 // that was a swipe, not a tap
    const a=ABILITIES[el.dataset.a], p=S.player;
    if(lineCost(p)+a.cost>p.ec) return;
    if(usesLeft(p,a)<=0) return;                // out of shots until it refills
    const filledBefore = p.line.map(e=>!!e);
    if(!placeEntries(p,a)) return;              // needs consecutive free slots
    sfx("place"); render();
    /* render() rebuilds the track, so the arrival class goes on afterwards —
       and only on the slots this tap actually filled. */
    p.line.forEach((e,i)=>{
      if(!e || filledBefore[i]) return;
      const st=$("pTrack").querySelector(`.station[data-idx="${i}"]`);
      if(st) st.classList.add("added");
    });
  }));
  $("abDots").querySelectorAll(".abdot").forEach(d=>
    d.addEventListener("click",()=>{ gotoPage(+d.dataset.p); sfx("tap"); }));
  $("abPrev").addEventListener("click",()=>{ gotoPage(abPage-1); sfx("tap"); });
  $("abNext").addEventListener("click",()=>{ gotoPage(abPage+1); sfx("tap"); });

  /* Pointer events rather than touch events: one code path covers finger and
     mouse, which is what lets a phone-only game stay playable on a desktop. */
  const vp = $("abilScroll"); let sx=0, sy=0, dragging=false, captured=0;
  /* Capture only once this is genuinely a DRAG. Capturing on pointerdown
     retargets the click that follows to the viewport, so it never reaches the
     .abrow underneath and taps stop placing abilities entirely. */
  vp.addEventListener("pointerdown", e=>{
    dragging=true; abDragMoved=0; captured=0; sx=e.clientX; sy=e.clientY;
  });
  vp.addEventListener("pointermove", e=>{
    if(!dragging) return;
    const dx=e.clientX-sx;
    abDragMoved=Math.max(abDragMoved, Math.abs(dx));
    if(abDragMoved>8){                          // follow the finger once it is a drag
      if(!captured){ try{ vp.setPointerCapture(e.pointerId); captured=e.pointerId; }catch(_){} }
      $("abPages").style.transition="none";
      $("abPages").style.transform=`translateX(calc(${-abPage*100}% + ${dx}px))`;
    }
  });
  const end = e=>{
    if(!dragging) return; dragging=false;
    if(captured){ try{ vp.releasePointerCapture(captured); }catch(_){} captured=0; }
    const dx=e.clientX-sx, dy=e.clientY-sy;
    if(Math.abs(dx)>RULES.swipeMinPx && Math.abs(dx)>Math.abs(dy)) gotoPage(abPage + (dx<0?1:-1));
    else gotoPage(abPage);                      // snap back
    /* abDragMoved is NOT cleared here — the click that follows still has to see
       it, and pointerdown resets it at the start of the next interaction. */
  };
  vp.addEventListener("pointerup", end);
  vp.addEventListener("pointercancel", end);

  gotoPage(0, false);
}
function renderTray(){
  const p=S.player, spent=lineCost(p);
  $("abPages").querySelectorAll(".abrow").forEach(el=>{
    const a=ABILITIES[el.dataset.a], need=(a.charge||0)+1;
    const cd=cooldownLeft(p,a.id), left=usesLeft(p,a);
    el.classList.toggle("cool", cd>0);
    const num=el.querySelector(".cdnum"); if(num) num.textContent = cd>0 ? cd : "";
    el.querySelectorAll(".shot").forEach((d,i)=>d.classList.toggle("spent", i>=left));
    el.classList.toggle("dis", !(S.phase==="BUILD" && cd===0 && left>0
                                 && emptySlots(p)>=need && spent+a.cost<=p.ec));
  });
  const btn=$("departBtn"), empty=p.line.length===0;
  btn.classList.toggle("rest",empty);
  btn.textContent=empty?"REST \u25B6":"DEPART \u25B6";
}
function render(){renderStats();renderLines();renderTray();}

/* ================= TOOLTIPS =================
   Long-press an ability, tap a status. Blurbs live in the spreadsheet and carry
   two marks: *text* for emphasis and {TOKEN} for a colour-coded keyword. Keeping
   the markup this thin means writers never touch HTML, and an unknown token
   degrades to plain ink rather than breaking the tooltip. */
const KW_COLOR = {
  MS:"#b0ffe1", EC:null, LAYER:"#f4efe4", LAYERS:"#f4efe4",
  OVERLOAD:"#e53859",
  ANGER:"#e53859", SURPRISE:"#724082", DISGUST:"#56a36a",
  JOY:"#fcc336",   SADNESS:"#3d66c1",   FEAR:"#929fa5"
};
const esc = t => t.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
function tipMarkup(text){
  return esc(text || "")
    .replace(/\{([A-Z_]+)\}/g, (_, k) => {
      const c = KW_COLOR[k];
      if(c === null) return `<b class="kw rain">${k}</b>`;      // EC gets the ramp
      return `<b class="kw" style="color:${c || "var(--ink)"}">${k}</b>`;
    })
    .replace(/\*(.+?)\*/g, '<b class="em">$1</b>');
}
function showTip(html, anchorEl){
  const tip = $("tip"), veil = $("tipVeil");
  tip.innerHTML = html;
  tip.classList.add("on"); veil.classList.add("on");
  /* Placed against the screen, then nudged back inside it — a tooltip that runs
     off a 375px phone is worse than one that is slightly off-centre. */
  const sr = $("screen").getBoundingClientRect(), ar = anchorEl.getBoundingClientRect();
  tip.style.left = "0px"; tip.style.top = "0px";
  const tr = tip.getBoundingClientRect();
  let x = (ar.left - sr.left) + ar.width/2 - tr.width/2;
  let y = (ar.top  - sr.top) - tr.height - 10;
  if(y < 6) y = (ar.bottom - sr.top) + 10;                 // no room above: go below
  x = Math.max(6, Math.min(x, sr.width - tr.width - 6));
  y = Math.max(6, Math.min(y, sr.height - tr.height - 6));
  tip.style.left = Math.round(x) + "px";
  tip.style.top  = Math.round(y) + "px";
  sfx("tap");
}
function hideTip(){ $("tip").classList.remove("on"); $("tipVeil").classList.remove("on"); }

function abilityTip(a){
  return `<div class="tiphead" style="color:${abAccent(a)}">${a.name.toUpperCase()}</div>`+
         `<div class="tipbody">${tipMarkup(a.blurb)}</div>`;
}
function statusTip(st, turns){
  return `<div class="tiphead" style="color:${st.color}">${st.name.toUpperCase()}</div>`+
         `<div class="tipbody">${tipMarkup(st.blurb)}</div>`+
         `<div class="tipturns">${turns} ${turns===1?"TURN":"TURNS"} LEFT</div>`;
}

/* One listener for the whole screen: any tap that is not on the tooltip closes it. */
function wireTips(){
  $("tipVeil").addEventListener("pointerdown", e=>{ e.preventDefault(); hideTip(); });
  $("screen").addEventListener("pointerdown", e=>{
    if($("tip").classList.contains("on") && !e.target.closest("#tip")) hideTip();
  }, true);
  /* Statuses open on a plain tap — they are small and read-only. */
  for(const id of ["eStatus","pStatus"]){
    const host = $(id); if(!host) continue;
    host.addEventListener("click", e=>{
      const tag = e.target.closest(".stag"); if(!tag) return;
      const u = id === "eStatus" ? S.enemy : S.player;
      const st = STATUSES[tag.dataset.k]; if(!st) return;
      showTip(statusTip(st, u.statuses[tag.dataset.k] || 0), tag);
    });
  }
}
