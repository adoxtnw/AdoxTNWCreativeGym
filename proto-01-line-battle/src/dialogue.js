"use strict";
/* NEURO-METRO: AVUI — personas, speech bubbles, backdrop
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */


/* ================= ENEMY DIALOGUE ================= */
function pickPersona(u){
  const rows=DIALOGUE.filter(d=>d.emotion===u.emotion && d.enabled!==false && d.line);
  if(!rows.length) return null;
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
  document.querySelector(".phone").style.background=
    `linear-gradient(180deg,#000 0%,#050408 22%,${bg} 100%)`;
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
