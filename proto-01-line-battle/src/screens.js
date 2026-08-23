"use strict";
/* NEURO-METRO: AVUI — opening sequence and enemy defeat
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */


async function typeName(){
  const el=$("personaName"), full=el.dataset.full||"";
  el.classList.add("typing");
  for(let i=0;i<full.length;i++){
    el.textContent=full.slice(0,i+1);
    if(full[i].trim()) sfxAt(SOUNDS.speak, 0.55+i*0.02);
    await sleep(105);
  }
  await sleep(420);
  el.classList.remove("typing");
}

/* ---------------- opening sequence ---------------- */
async function whiteFlash(times){
  for(let i=0;i<times;i++){
    $("flash").classList.remove("on"); void $("flash").offsetWidth;
    $("flash").classList.add("on");
    await sleep(150);
  }
  $("flash").classList.remove("on");
}
async function intro(){
  const track=$("introTrack"), wipe=$("introWipe"), banner=$("banner");
  // four stations strung along the diagonal, the last one landing dead centre
  const SP=210;
  for(let i=0;i<4;i++){
    const d=document.createElement("div");
    d.className="introstation"; d.style.left=(i*SP)+"px";
    track.appendChild(d);
  }
  await waitAnim(track.animate(
    [{transform:`translateY(-50%) translateX(${-(3*SP)-560}px)`},
     {transform:"translateY(-50%) translateX(0px)"}],
    {duration:1650, easing:"cubic-bezier(.12,.72,.22,1)", fill:"forwards"}), 1650);
  await sleep(200);

  // a black circle swells out of the centre while the screen strobes
  wipe.animate([{transform:"translate(-50%,-50%) scale(0)"},
                {transform:"translate(-50%,-50%) scale(1)"}],
               {duration:780, easing:"cubic-bezier(.5,0,.6,1)", fill:"forwards"});
  sfx("clash");
  await whiteFlash(3);
  await sleep(160);

  // everything is black now — swap the intro away and let the enemy rise into it
  $("intro").classList.add("clear");
  track.innerHTML=""; wipe.style.display="none";
  const stage=$("stage");
  stage.style.opacity="1";
  // rises hard, overshoots, shudders, settles — stepped so it reads at 12 fps
  await waitAnim(stage.animate([
    {transform:"translate(0,150px) scale(.45)", opacity:0,   offset:0},
    {transform:"translate(0,96px) scale(.58)",  opacity:.45, offset:.16},
    {transform:"translate(-7px,52px) scale(.86)",opacity:.9, offset:.34},
    {transform:"translate(6px,18px) scale(1.30)",opacity:1,  offset:.50},
    {transform:"translate(-9px,26px) scale(1.02)",opacity:1, offset:.60},
    {transform:"translate(8px,4px) scale(1.22)", opacity:1,  offset:.70},
    {transform:"translate(-6px,12px) scale(1.04)",opacity:1, offset:.79},
    {transform:"translate(5px,-4px) scale(1.14)",opacity:1,  offset:.87},
    {transform:"translate(-3px,3px) scale(1.03)",opacity:1,  offset:.94},
    {transform:"translate(0,0) scale(1)",        opacity:1,  offset:1}
  ],{duration:2000, easing:"steps(24,end)", fill:"forwards"}), 2000);
  stage.style.transform="";

  // the name resolves over the enemy, one letter at a time
  await typeName();

  await speak(S.enemy.persona && S.enemy.persona.lines.INTRO, S.enemy.emotion);

  // and only now does the interface arrive
  $("floorWrap").classList.add("lit");
  $("intro").remove();
  $("screen").classList.remove("preintro");
  document.querySelectorAll(".screen > *").forEach((el,i)=>{
    el.animate([{opacity:0},{opacity:1}],{duration:420,delay:i*45,easing:"steps(4)",fill:"backwards"});
  });
}

/* ---------------- enemy defeat: the layers come apart ---------------- */
function enemyCollapse(){
  const wrap=document.querySelector(".sprwrap");
  const sr=$("screen").getBoundingClientRect(), r=wrap.getBoundingClientRect();
  const cx=r.left-sr.left+r.width/2, cy=r.top-sr.top+r.height/2, scale=r.width/EW;
  const all=[...S.enemy.layers, ...S.enemy.broken];
  all.forEach((l,i)=>{
    const g=slotGeom(i,E_CFG, i===0?RULES.layerOuterThick:RULES.layerInnerThick);
    const d=g.outer*2*scale, bw=Math.max(3,(g.outer-g.inner)*scale);
    const el=document.createElement("div");
    el.className="fallring";
    el.style.cssText=`left:${cx-d/2}px;top:${cy-d/2}px;width:${d}px;height:${d}px;`+
                     `border-width:${bw}px;color:${emoHex(l.e)}`;
    $("screen").appendChild(el);
    const dx=(Math.random()*2-1)*110, rot=(Math.random()*2-1)*220;
    el.animate([
      {transform:"translate(0,0) rotate(0deg) scale(1)", opacity:1},
      {transform:`translate(${dx*0.4}px,${-30-Math.random()*30}px) rotate(${rot*0.2}deg) scale(1.05)`,
       opacity:1, offset:.22},
      {transform:`translate(${dx}px,${sr.height*0.48}px) rotate(${rot}deg) scale(.45)`, opacity:0}
    ],{duration:1600+i*140, delay:i*110, easing:"cubic-bezier(.4,.02,.7,1)", fill:"forwards"});
    setTimeout(()=>el.remove(), 2400+i*160);
  });
  wrap.style.opacity="0";
  $("floorWrap").classList.remove("lit");
  S.enemy.layers.length=0; S.enemy.broken.length=0;
}
