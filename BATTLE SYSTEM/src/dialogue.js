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
  /* A PINNED PERSONA IS NOT A PICK. `units.persona` names one row set outright,
     which is the whole difference between a boss and an encounter: the Line
     Manager has to be the Line Manager every time you come back for her, and
     random casting is exactly what would stop that. Falls through to the random
     path if the name has gone, because a boss with no lines should still fight. */
  if(u.persona_id){
    const pinned=all.filter(d=>d.persona===u.persona_id);
    if(pinned.length){
      const lines={};
      pinned.forEach(d=>{ lines[d.state]=d.line; });
      return {name:u.persona_id, lines};
    }
    console.warn("units.persona names '"+u.persona_id+"', which the dialogue sheet does not have");
  }
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
  let [r,g,b]=hexRGB(hex);

  /* ---- HOW HARD THE EMOTION IS LIT --------------------------------------
     `bg_bright` on the units row multiplies it, so one enemy can be lit three
     times as brightly as the rest of the network without a second backdrop
     function existing.

     WHY THIS IS NOT SIMPLY `alpha * 3`. Alpha saturates: the default glow is
     0.55, so anything past about 1.8x is the same picture as 1.8x, and asking
     for three would quietly get you not much more than two. Brightness on a
     screen is three things at once, so the multiplier spends itself on all
     three - the tint goes more opaque UNTIL it saturates, the colour is then
     lifted toward white, and the falloff is pushed further down the panel so
     the light fills the room rather than hanging in the top corner. Below about
     1.7x only the first of those does anything, which is why every ordinary
     enemy looks exactly as it did.

     The ceilings are deliberate: at a full flood the entity's silhouette still
     has to sit against something, or a bright fight is a bright rectangle with
     a boss lost somewhere inside it. */
  const mult=Math.max(0.01, S.enemy.bgBright || 1);
  const want=RULES.backdropGlow*mult;
  const a=Math.min(0.95, want);
  const lift=Math.max(0, Math.min(0.6, (want-a)/2));     /* colour toward white */
  r=Math.round(r+(255-r)*lift); g=Math.round(g+(255-g)*lift); b=Math.round(b+(255-b)*lift);
  const mid=Math.min(0.86, 0.38*mult);                   /* how far the light reaches */
  const out=Math.min(0.99, 0.72*mult);
  /* the floor the whole thing stands on lifts with it, or a flooded top half
     meeting a black bottom half reads as two pictures rather than one room */
  const [br,bgc,bb]=hexRGB(bg);
  const base="rgb("+[br,bgc,bb].map((c,i)=>
    Math.round(c+([r,g,b][i]-c)*Math.min(0.5,lift))).join(",")+")";
  /* `bg_hex` alone is nearly black, so the emotion barely registered. The tint is
     now the emotion's REAL colour, hung above the entity, over that dark base. */
  document.querySelector(".phone").style.background=
    `radial-gradient(120% 70% at 50% -8%, rgba(${r},${g},${b},${a}) 0%, `+
      `rgba(${r},${g},${b},${(a*0.35).toFixed(3)}) ${(mid*100).toFixed(1)}%, `+
      `rgba(0,0,0,0) ${(out*100).toFixed(1)}%), `+
    `linear-gradient(180deg,#000 0%,#050408 20%,${base} 100%)`;
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
  enemyFlourish();
}

/* ---- WHAT HAPPENS AROUND ONE PARTICULAR ENEMY -------------------------------
   Same registry shape as AbilityFx and the map's StationFx: keyed by the `fx`
   column with a silent default, so an enemy naming a flourish nobody has drawn
   yet is simply an enemy with no flourish rather than a crash.

   `stop` is as important as `start`. These run on their own timers, outside the
   turn loop, and a fight that ends while one is still firing would leave it
   flashing over the results panel for the rest of the session. */
const EnemyFx = {
  _reg:Object.create(null), _live:null,
  define(id, spec){ this._reg[id]=spec; return spec; },
  of(id){ return (id && this._reg[id]) || null; }
};
function enemyFlourish(){
  stopFlourish();
  const fx=EnemyFx.of(S.enemy.fx);
  if(!fx || !fx.start) return;
  EnemyFx._live=fx;
  fx.start();
}
function stopFlourish(){
  const live=EnemyFx._live; EnemyFx._live=null;
  if(live && live.stop) live.stop();
}

/* PAPARAZZI — the Line Manager is being photographed, constantly, by nobody.
   Flashes fire in bursts rather than on a metronome: a steady blink reads as a
   warning light, and a ragged one reads as a crowd. Each is a hard white pop
   somewhere around her with a coloured afterglow, drawn as a DOM layer over the
   stage rather than into the sprite canvas, because it belongs to the ROOM. */
EnemyFx.define("PAPARAZZI", {
  start(){
    const stage=$("stage"); if(!stage) return;
    const layer=document.createElement("div");
    layer.className="paparazzi"; layer.id="paparazzi";
    stage.appendChild(layer);
    const pop=()=>{
      if(!document.getElementById("paparazzi")) return;
      const f=document.createElement("i");
      /* kept off the middle third, so she is never behind her own flash */
      const side=Math.random()<0.5 ? Math.random()*32 : 68+Math.random()*32;
      f.style.cssText="left:"+side.toFixed(1)+"%;top:"+(8+Math.random()*70).toFixed(1)+"%;"+
                      "--s:"+(0.6+Math.random()*0.9).toFixed(2);
      layer.appendChild(f);
      setTimeout(()=>f.remove(), 420);
    };
    const burst=()=>{
      if(!document.getElementById("paparazzi")) return;
      const n=1+Math.floor(Math.random()*3);
      for(let i=0;i<n;i++) setTimeout(pop, i*90+Math.random()*70);
      /* the next burst is scheduled from inside this one, so the gap is
         re-rolled every time instead of being one fixed interval */
      this._t=setTimeout(burst, 500+Math.random()*1400);
    };
    burst();
  },
  stop(){
    clearTimeout(this._t);
    const l=document.getElementById("paparazzi"); if(l) l.remove();
  }
});
