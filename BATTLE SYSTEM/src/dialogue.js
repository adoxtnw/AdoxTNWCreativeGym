"use strict";
/* NEURO-METRO: AVUI — personas, speech bubbles, backdrop
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */


/* ================= ENEMY DIALOGUE ================= */
/* WHO THIS ENEMY IS TODAY.

   A persona is picked at random from the rows matching the enemy's emotion, so
   the same units row is a different person every time you meet it — that is
   where the enemy's NAME comes from, and all four of its lines.

   TIER NARROWS IT. Without that, The Enforcer would speak The Commuter's lines,
   because both are Anger — and an enemy twice the size sounding exactly like the
   ordinary one throws away the only thing the fight had said so far. So:

     rows for this emotion carrying this TIER   ->   use those
     none                                       ->   the rows with a BLANK tier

   Blank means ANY tier, not "no tier": the thirty imported personas stay
   available to everyone, and a WEAK or STRONG enemy speaks only in its own
   voice. Falling back rather than failing means a new tier can be added to the
   units sheet and still have someone to speak as. */
function pickPersona(u){
  const all=DIALOGUE.filter(d=>d.emotion===u.emotion && d.enabled!==false && d.line);
  if(!all.length) return null;
  const tier=u.tier||"REGULAR";
  let rows=all.filter(d=>(d.tier||"")===tier);
  if(!rows.length) rows=all.filter(d=>!d.tier);
  if(!rows.length) rows=all;
  const names=[...new Set(rows.map(d=>d.persona))];
  const name=names[Math.floor(Math.random()*names.length)];   // a different one each battle
  const lines={};
  rows.filter(d=>d.persona===name).forEach(d=>{ lines[d.state]=d.line; });
  return {name, lines};
}
let bubbleToken=0;
async function speak(text, emotion){
  if(!text) return;
  const tok=++bubbleToken;
  const el=document.createElement("div");
  el.className="bubblewrap";
  el.style.setProperty("--c", emoHex(emotion));
  const border=document.createElement("div"); border.className="bubbleborder pxr";
  const box=document.createElement("div"); box.className="bubble pxr";
  const body=document.createElement("span"); box.appendChild(body);
  const tail=document.createElement("i"); tail.className="tail";
  el.appendChild(border); el.appendChild(box); el.appendChild(tail);
  $("screen").appendChild(el);
  // sits just below the enemy, overlapping it slightly, with the tail aimed at its centre
  const sr=$("screen").getBoundingClientRect();
  const spr=document.querySelector(".sprwrap").getBoundingClientRect();
  el.style.top=(spr.bottom-sr.top-16)+"px";
  const wrapBox=el.getBoundingClientRect();
  tail.style.left=((spr.left+spr.width/2)-wrapBox.left)+"px";
  for(let i=0;i<text.length;i++){
    if(tok!==bubbleToken){ el.remove(); return; }
    body.textContent=text.slice(0,i+1);
    const ch=text[i];
    if(ch.trim()){ sfxAt(SOUNDS.speak, 0.92+((i*7)%5)*0.05); await sleep(RULES.typeMs); }
    else await sleep(Math.round(RULES.typeMs*0.5));
  }
  await sleep(RULES.dialogueHoldMs);
  if(tok!==bubbleToken){ el.remove(); return; }
  await waitAnim(el.animate([{opacity:1},{opacity:0}],{duration:280,fill:"forwards"}), 280);
  el.remove();
}
/* fires the winning / losing lines the first time either side crosses the mark */
function checkDialogue(){
  const P=S.enemy.persona; if(!P) return;
  const pct=(u)=>u.ms/u.maxMs;
  if(!S.saidLosing && S.enemy.ms>0 && pct(S.enemy)<RULES.lowHpTalkPct){
    S.saidLosing=true; speak(P.lines.LOSING, S.enemy.emotion); return;
  }
  if(!S.saidWinning && S.player.ms>0 && pct(S.player)<RULES.lowHpTalkPct){
    S.saidWinning=true; speak(P.lines.WINNING, S.enemy.emotion);
  }
}
/* the backdrop takes the enemy's colour */
function applyBackdrop(){
  const e=EMOTIONS[S.enemy.emotion];
  const bg=(e&&e.bg_hex)||"#1a1e20";
  const hex=(e&&e.hex)||"#929fa5";
  const [r,g,b]=hexRGB(hex), a=RULES.backdropGlow;
  /* `bg_hex` alone is nearly black, so the emotion barely registered. The tint is
     now the emotion's REAL colour, hung above the entity, over that dark base. */
  document.querySelector(".phone").style.background=
    `radial-gradient(120% 70% at 50% -8%, rgba(${r},${g},${b},${a}) 0%, `+
      `rgba(${r},${g},${b},${(a*0.35).toFixed(3)}) 38%, rgba(0,0,0,0) 72%), `+
    `linear-gradient(180deg,#000 0%,#050408 20%,${bg} 100%)`;
}
function applyPersona(){
  const P=pickPersona(S.enemy);
  S.enemy.persona=P;
  if(P) S.enemy.name=P.name;
  const el=$("personaName");
  el.dataset.full=(P?P.name:S.enemy.name).toUpperCase();
  el.textContent="";                      // typed in during the opening
  el.style.setProperty("--c", emoHex(S.enemy.emotion));
  applyBackdrop();
}
