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
  const ctx=gaugeCtx(el.id), dctx=gaugeCtx(el.id+"Dead");
  drawGauge(ctx, dctx, u, opts);
  // hand the animation loop what it needs to keep repainting this bar
  GaugeView.targets = GaugeView.targets || {};
  GaugeView.targets[u===S.player?"p":"e"] = {ctx, dctx, opts};
  const sMs=u.shownMs!=null?u.shownMs:u.ms, sEc=u.shownEc!=null?u.shownEc:u.ec;
  opts.tagMs.textContent=sMs+" MS";
  opts.tagEc.textContent=sEc+" EC";
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
    /* Overload is DERIVED — it is merged in here rather than stored, because
       tickStatuses() decrements everything it finds and would tick it away. */
    if(isOverloaded(u) && STATUSES.OVERLOAD) keys.unshift("OVERLOAD");
    host.innerHTML = keys.map(k => {
      const st = STATUSES[k];
      const label = (u.statusSource && u.statusSource[k]) || st.name;
      /* Overload carries no turn count: it lasts while charge is over stamina. */
      const over = k === "OVERLOAD";
      return `<div class="stag pxr${over ? " ramp overloadtag" : ""}" data-k="${k}"`+
             ` style="--sc2:${st.color}">`+
             `<svg viewBox="0 0 8 8" shape-rendering="crispEdges">${iconSVG(st.icon)}</svg>`+
             `<span>${label.toUpperCase()}</span>`+
             (over ? "" : `<b>${u.statuses[k]}</b>`)+`</div>`;
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
    tagMs:$("eTagMs"), tagEc:$("eTagEc")});
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
    /* OVERLOAD slots wear the OPPONENT's stamina colour: a corrupted station is
       something done TO you, so it should not look like yours. */
    const kind=slotKind(unit, i);
    const bonus=kind==="NORMAL" ? "" : " bonus "+kind.toLowerCase();
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
  /* The terminus points where the line will travel — right for you, left for the
     enemy — and for you it is also the DEPART control. */
  const arrow=`<div class="term${first?"":" dead"}" style="color:${headCol}">`+
              `${arrowSVG(unit.dir>0)}</div>`;
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
  /* The charge tail, drawn as stations again — the ×N shorthand read worse than
     the thing it replaced. Capped, so a long charge stays the width of a short one. */
  let line="";
  const shown=Math.min(a.charge||0, RULES.chargeShownMax);
  for(let i=0;i<shown;i++)
    line+=`<div class="link" style="color:${col}"></div>`+
          `<div class="station chg" style="color:${col}">${chargeSVG()}</div>`;
  line+=`<div class="link" style="color:${col}"></div><div class="station" style="color:${col}">${stationSVG(a.icon)}</div>`;
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
      </div>
      <div class="infotag pxr" title="What does this do?">i</div></div>`;
}
/* ---------- the Emotions panel is paged, not scrolled ----------
   Four abilities to a page, swiped with a pointer so the same gesture works
   under a finger and under a mouse. Position is shown by dots; the triangles
   are only indicators that another page exists that way. */
let abPage = 0, abDragMoved = 0, abLongPressed = false;
const abPageCount = () => Math.max(1, S.player.loadouts.length);

function gotoPage(p, animate){
  const n = abPageCount();
  abPage = Math.max(0, Math.min(n - 1, p));
  const pages = $("abPages");
  pages.style.transition = animate === false ? "none" : "";
  pages.style.transform  = `translateX(${-abPage * 100}%)`;
  $("loadoutBar").querySelectorAll(".lobtn")
    .forEach((b,i)=>b.classList.toggle("on", i===abPage));
}

/* Defend and Recharge are ACTIONS: always present, never paginated, and they sit
   in the strip the EMOTIONS/DEPART buttons used to occupy. `action` is a column
   in the sheet, so which abilities are actions is content, not code. */
const isAction  = a => !!a.action;
const actionsOf = u => u.pool.filter(isAction);

/* The glyph tiled behind a Loadout button, built from the SAME 8x8 grid the station
   icons use — so the emotion's symbol has one source of truth in util.js. */
function patternURI(iconKey){
  const g = ICONS[iconKey] || ICONS.WARN;
  let rects = "";
  g.forEach((row,y)=>row.split("").forEach((c,x)=>{
    if(c === "x") rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="46" height="46">`+
              `<g fill="#ffffff" fill-opacity="${RULES.loadoutPatternAlpha}">${rects}</g></svg>`;
  /* NO quotes inside url(): this value is written into a style ATTRIBUTE, and a
     double quote there ends the attribute — which silently invalidated the whole
     background-image and left the buttons colourless. The payload is
     percent-encoded, so quotes are not needed. */
  return `url(data:image/svg+xml,${encodeURIComponent(svg)})`;
}
/* Slightly darker, for the button's gradient. */
function darken(hex, k){
  const [r,g,b] = hexRGB(hex);
  const f = v => Math.max(0, Math.round(v*k)).toString(16).padStart(2,"0");
  return `#${f(r)}${f(g)}${f(b)}`;
}

/* Rebuilt whenever the carried Loadouts change. Its listener is delegated and lives
   in wirePanelGestures(), so rebuilding never stacks handlers. */
function renderLoadoutBar(){
  const bar = $("loadoutBar"); if(!bar) return;
  bar.innerHTML = S.player.loadouts.map((id,i)=>{
    const lo = LOADOUTS[id];
    const emo = lo ? lo.emotion : "";
    const hex = emoHex(emo);
    const name = lo ? lo.name.toUpperCase() : "—";
    return `<button class="lobtn pxr" data-slot="${i}" style="--emo:${hex};`+
           `--emoDark:${darken(hex,0.55)};--pat:${patternURI((EMOTIONS[emo]||{}).icon)};`+
           `--i:${i}"><span>${name}</span></button>`;
  }).join("");
}

/* Placing, INFO and long-press, for a row anywhere — panel page or action strip. */
function wireAbilityRow(el){
  const a = ABILITIES[el.dataset.a];
  const info = el.querySelector(".infotag");
  if(info) info.addEventListener("click", ev => {
    ev.stopPropagation();                       // INFO explains, it does not place
    showTip(abilityTip(a), el, abAccent(a));
  });
  el.addEventListener("click", () => {
    if(S.phase!=="BUILD") return;
    if(abLongPressed){ abLongPressed=false; return; }
    if(abDragMoved > 8) return;
    const p=S.player;
    if(lineCost(p)+a.cost>p.ec) return;
    if(usesLeft(p,a)<=0) return;
    const filledBefore = p.line.map(e=>!!e);
    if(!placeEntries(p,a)) return;
    sfx("place"); render();
    p.line.forEach((e,i)=>{
      if(!e || filledBefore[i]) return;
      const st=$("pTrack").querySelector(`.station[data-idx="${i}"]`);
      if(st) st.classList.add("added");
    });
  });
  let held=null;
  const cancel = () => { if(held){ clearTimeout(held); held=null; } };
  el.addEventListener("pointerdown", () => {
    cancel();
    held = setTimeout(() => { held=null;
      if(abDragMoved > 8) return;
      abLongPressed = true; showTip(abilityTip(a), el, abAccent(a));
    }, RULES.longPressMs);
  });
  el.addEventListener("pointermove", () => { if(abDragMoved > 8) cancel(); });
  ["pointerup","pointercancel","pointerleave"].forEach(t=>el.addEventListener(t,cancel));
}

function buildActions(){
  const row = $("actionRow"); if(!row) return;
  row.innerHTML = actionsOf(S.player).map(abilRowHTML).join("");
  row.querySelectorAll(".abrow").forEach(el => wireAbilityRow(el));
}

/* An unfilled Loadout slot. It is a real cell — the grid keeps its shape — but it
   carries no ability, so nothing wires it and renderTray skips it. */
const emptySlotHTML = () => `<div class="abrow empty pxr"></div>`;

/* MARKUP ONLY, and safe to call again: every gesture listener lives in
   wirePanelGestures(). That split is what lets a future equip screen rebuild the
   panel without stacking handlers. */
function buildPanel(){
  $("abPages").innerHTML = S.player.loadouts.map(id =>
    `<div class="abpage">` +
    loadoutSlotList(id).map(a => a ? abilRowHTML(a) : emptySlotHTML()).join("") +
    `</div>`).join("");
  $("abPages").querySelectorAll(".abrow[data-a]").forEach(el => wireAbilityRow(el));
  buildActions();
  renderLoadoutBar();
  gotoPage(Math.min(abPage, abPageCount()-1), false);
}

function wirePanelGestures(){
  /* Delegated: the buttons are rebuilt on every equip change, the listener is not. */
  $("loadoutBar").addEventListener("click", e=>{
    const b = e.target.closest(".lobtn"); if(!b) return;
    gotoPage(+b.dataset.slot);
    if(!panelOpen()) togglePanel(); else sfx("tap");   // tapping a Loadout opens it
  });

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
}
function panelOpen(){ return $("abilPanel").classList.contains("open"); }
/* Actions belong to the panel, so they are shown and hidden with it — right here
   rather than waiting for the next render, which a bare toggle would not trigger. */
function syncPanelChrome(){
  const open = panelOpen();
  $("emoCue").classList.toggle("hide", open);
  $("actionRow").classList.toggle("show", open);
}
function closePanel(){ $("abilPanel").classList.remove("open"); syncPanelChrome(); }
function togglePanel(){ $("abilPanel").classList.toggle("open"); syncPanelChrome(); sfx("tap"); }

/* The line's cue, re-drawn each turn so the game keeps asking in a different voice. */
function newPrompt(){
  const el = $("emoCue"); if(!el || !PROMPTS.length) return;
  const p = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
  el.firstChild ? el.firstChild.replaceWith(p.text) : el.prepend(p.text);
}

function renderTray(){
  const p=S.player, spent=lineCost(p);
  $("abPages").querySelectorAll(".abrow[data-a]").forEach(el=>{
    const a=ABILITIES[el.dataset.a], need=(a.charge||0)+1;
    const cd=cooldownLeft(p,a.id), left=usesLeft(p,a);
    el.classList.toggle("cool", cd>0);
    const num=el.querySelector(".cdnum"); if(num) num.textContent = cd>0 ? cd : "";
    el.querySelectorAll(".shot").forEach((d,i)=>d.classList.toggle("spent", i>=left));
    el.classList.toggle("dis", !(S.phase==="BUILD" && cd===0 && left>0
                                 && emptySlots(p)>=need && spent+a.cost<=p.ec));
  });
  $("actionRow").querySelectorAll(".abrow[data-a]").forEach(el=>{
    const a=ABILITIES[el.dataset.a], need=(a.charge||0)+1;
    const cd=cooldownLeft(p,a.id), left=usesLeft(p,a);
    el.classList.toggle("cool", cd>0);
    const num=el.querySelector(".cdnum"); if(num) num.textContent = cd>0 ? cd : "";
    el.querySelectorAll(".shot").forEach((d,i)=>d.classList.toggle("spent", i>=left));
    el.classList.toggle("dis", !(S.phase==="BUILD" && cd===0 && left>0
                                 && emptySlots(p)>=need && spent+a.cost<=p.ec));
  });
  /* DEPART only exists while there is something to send, and it goes the instant
     it is tapped rather than lingering through the resolution. */
  $("departBtn").classList.toggle("show", S.phase==="BUILD" && !S.busy && slotsUsed(p)>0);
  syncPanelChrome();
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
function showTip(html, anchorEl, accent){
  const tip = $("tip"), veil = $("tipVeil");
  tip.innerHTML = html;
  tip.style.setProperty("--tipc", accent || "var(--line)");
  tip.classList.add("on"); veil.classList.add("on");
  /* Placed against the screen, then nudged back inside it — a tooltip that runs
     off a 375px phone is worse than one that is slightly off-centre. */
  const sr = $("screen").getBoundingClientRect(), ar = anchorEl.getBoundingClientRect();
  tip.style.left = "0px"; tip.style.top = "0px";
  const tr = tip.getBoundingClientRect();
  const anchorX = (ar.left - sr.left) + ar.width/2;
  let x = anchorX - tr.width/2;
  let y = (ar.top - sr.top) - tr.height - 14;
  const below = y < 6;
  if(below) y = (ar.bottom - sr.top) + 14;                 // no room above: flip under
  x = Math.max(6, Math.min(x, sr.width - tr.width - 6));
  y = Math.max(6, Math.min(y, sr.height - tr.height - 6));
  tip.style.left = Math.round(x) + "px";
  tip.style.top  = Math.round(y) + "px";
  /* The tail tracks the anchor rather than the bubble, so it still points at the
     right thing after the bubble has been nudged back inside the screen. */
  tip.classList.toggle("below", below);
  tip.style.setProperty("--tail", Math.round(Math.max(14, Math.min(anchorX - x, tr.width - 14))) + "px");
  sfx("tap");
}
function hideTip(){ $("tip").classList.remove("on"); $("tipVeil").classList.remove("on"); }

/* The numbers that used to sit in the ability box live here now, so the box has
   room for INFO and the box itself stays uncluttered. */
/* The cost and the payload, wearing the same chip as the value tags on the bars. */
function abilityStats(a){
  const out=[];
  if(a.cost>0)  out.push(`<span class="tstat ec pxr">-${a.cost} EC</span>`);
  if(a.kind==="DAMAGE") out.push(`<span class="tstat pxr">${a.power} DMG</span>`);
  else if(a.kind==="CHARGE"){ out.push(`<span class="tstat ec pxr">+${a.power} EC</span>`);
    if(a.self_ms) out.push(`<span class="tstat pxr">-${a.self_ms} MS</span>`); }
  else if(a.kind==="SHIELD") out.push(`<span class="tstat pxr">BLOCK ${a.power}</span>`);
  if(a.charge)  out.push(`<span class="tstat pxr">${a.charge} CHARGE</span>`);
  return out.length ? `<div class="tipstats">${out.join("")}</div>` : "";
}
/* No title: the bubble points at the ability, so naming it again is noise. */
function abilityTip(a){
  return `<div class="tipbody">${tipMarkup(a.blurb)}</div>` + abilityStats(a);
}
function statusTip(st, turns, derived){
  return `<div class="tiphead" style="color:${st.color}">${st.name.toUpperCase()}</div>`+
         `<div class="tipbody">${tipMarkup(st.blurb)}</div>`+
         (derived ? `<div class="tipturns">UNTIL YOU BURN IT DOWN</div>`
                  : `<div class="tipturns">${turns} ${turns===1?"TURN":"TURNS"} LEFT</div>`);
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
      const k = tag.dataset.k, st = STATUSES[k]; if(!st) return;
      showTip(statusTip(st, u.statuses[k] || 0, k === "OVERLOAD"), tag, st.color);
    });
  }
}
