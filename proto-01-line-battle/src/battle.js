"use strict";
/* NEURO-METRO: AVUI — resolution, AI and the turn loop
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */

/* ================= COMBAT ================= */
/* One line, because every kind's behaviour lives in kinds.js. */
async function applyAbility(actor,target,ab,onEnemy,stationEl){
  await Kinds.get(ab.kind).run({actor,target,ab,onEnemy,stationEl});
}

function centerStation(lane,track,st){
  const tx=lane.clientWidth/2-(st.offsetLeft+st.offsetWidth/2);
  track.style.transform=`translateX(${Math.round(tx)}px)`;
}
/* Charging is not free, but it no longer interrupts. Holding on a charge segment
   used to fire the opponent's next station out of turn, which read as chaos — you
   were punished by an event you could not see coming. Instead, every charge
   segment a unit lays down grants the OPPONENT one temporary slot on their line
   next turn (see grantBonusSlots). The cost is the same shape — charging gives
   the other side more room to act — but it is visible before it matters. */
async function resolveLine(actor,target,laneId,trackId,onEnemy){
  const lane=$(laneId),track=$(trackId);
  if(slotsUsed(actor)===0){
    actor.ec+=RULES.restEc; actor.shownEc=actor.ec; sfx("regrow"); renderStats(); await sleep(800); return;
  }
  const cost=lineCost(actor);
  actor.ec-=cost; actor.shownEc=actor.ec; renderStats(); sfx("depart");
  await Hooks.emit("line:depart",{unit:actor,cost});
  await sleep(560);
  lane.classList.add("zoom"); await sleep(260);
  let chargeRun=0;
  while(actor.cursor < actor.line.length){
    if(S.player.ms<=0||S.enemy.ms<=0) break;
    const i=actor.cursor;
    const entry=actor.line[i];
    if(!entry){ actor.cursor++; continue; }
    const st=track.querySelector(`.station[data-idx="${i}"]`);
    if(st && !st.classList.contains("spent")) centerStation(lane,track,st);
    else { actor.cursor++; continue; }           // already spent by an interrupt
    await sleep(entry.charge?160:300);
    st.classList.add("active");
    await Hooks.emit("station:fire",{unit:actor,entry,index:i});

    if(entry.charge){
      chargeRun++;
      chargeTone(chargeRun);
      await Hooks.emit("charge:tick",{unit:actor,step:chargeRun});
      await sleep(RULES.chargeStepMs);
      st.classList.remove("active"); st.classList.add("spent");
      actor.cursor++;
      continue;
    }

    sfx("arrive"); await sleep(150);
    await applyAbility(actor,target,entry.ab,onEnemy,st);
    chargeRun=0; await sleep(180);
    st.classList.remove("active"); st.classList.add("spent");
    actor.cursor++;
    await sleep(110);
  }
  await sleep(200); lane.classList.remove("zoom");
  track.style.transform="translateX(0)"; await sleep(250);
}

async function clashSequence(playerDied){
  const screen=$("screen"), gauge=playerDied?$("pGauge"):$("eGauge");
  const sr=screen.getBoundingClientRect(), gr=gauge.getBoundingClientRect();
  const cx=gr.left-sr.left+4, cy=gr.top-sr.top+gr.height/2;
  setFps(3); screen.classList.add("slowmo"); gauge.classList.add("clash"); sfx("clash");
  if(!playerDied){
    enemyCollapse();                        // the enemy's layers scatter and drop
    bubbleToken++;                          // cut off anything mid-sentence
    if(S.enemy.persona) speak(S.enemy.persona.lines.DEFEAT, S.enemy.emotion);
  }
  const wv=document.createElement("div"); wv.className="wave";
  wv.style.left=cx+"px"; wv.style.top=cy+"px"; wv.style.transform="translate(-50%,-50%)";
  screen.appendChild(wv);
  wv.animate([{transform:"translate(-50%,-50%) scale(.15)",opacity:1},
              {transform:"translate(-50%,-50%) scale(11)",opacity:0}],
             {duration:2900,easing:"cubic-bezier(.08,.85,.24,1)",fill:"forwards"});
  const cols=Object.values(EMOTIONS).map(e=>e.hex).concat(["#f0ece0"]);
  for(let i=0;i<64;i++){
    const p=document.createElement("div"); p.className="pt";
    const s=4+Math.floor(Math.random()*4)*2;
    p.style.width=p.style.height=s+"px"; p.style.left=cx+"px"; p.style.top=cy+"px";
    p.style.background=cols[i%cols.length]; p.style.transform="translate(-50%,-50%)";
    screen.appendChild(p);
    const ang=Math.random()*Math.PI*2, spd=50+Math.random()*260;
    const bias=(cy<sr.height*0.5)?0.55:-0.55;
    const dx=Math.cos(ang)*spd, dy=Math.sin(ang)*spd*0.75+Math.abs(Math.sin(ang))*spd*bias;
    p.animate([{transform:"translate(-50%,-50%) scale(1)",opacity:1},
               {transform:`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.25)`,opacity:0}],
              {duration:2200+Math.random()*1700,easing:"cubic-bezier(.07,.86,.22,1)",fill:"forwards"});
  }
  $("flash").animate([{opacity:0},{opacity:.9,offset:.10},{opacity:.45,offset:.34},{opacity:0}],
                     {duration:RULES.clashSeconds*1000,fill:"forwards"});
  await sleep(RULES.clashSeconds*1000);
  screen.querySelectorAll(".pt,.wave").forEach(n=>n.remove());
  screen.classList.remove("slowmo"); gauge.classList.remove("clash");
}
function buildEnemyLine(){
  const e=S.enemy, p=S.player;
  clearLine(e); applyOverload(e);
  let ec=e.ec;
  let layers=p.layers.map(l=>l.e), shield=p.shield;
  const shieldAb=e.pool.find(a=>a.kind==="SHIELD");
  if(e.ms<e.maxMs*0.5 && e.shield===0 && shieldAb && ec>=shieldAb.cost
     && cooldownLeft(e,shieldAb.id)===0 && usesLeft(e,shieldAb)>0 && placeEntries(e,shieldAb)){
    ec-=shieldAb.cost;
  }
  let guard=0;
  while(emptySlots(e)>0 && guard++<40){
    const room=emptySlots(e);
    const usable=a=>a.cost<=ec && ((a.charge||0)+1)<=room && cooldownLeft(e,a.id)===0
                    && usesLeft(e,a)>0;
    let opts=e.pool.filter(a=>a.kind==="DAMAGE"&&usable(a));
    // charging is how the enemy hands itself extra actions, so it leans on it
    const charged=opts.filter(a=>(a.charge||0)>0);
    if(charged.length && Math.random()<RULES.aiChargeBias) opts=charged;
    if(!opts.length){
      // nothing affordable — top up instead of idling, if it can spare the stamina
      const rc=e.pool.find(a=>a.kind==="CHARGE"&&usable(a));
      if(rc && e.ms>(rc.self_ms||0)*2 && placeEntries(e,rc)) continue;
      break;
    }
    let best;
    if(Math.random()<RULES.aiVarietyChance){
      best=opts[Math.floor(Math.random()*opts.length)];   // occasionally off-book
    }else{
      best=opts[0]; let bestScore=-Infinity;
      for(const a of opts){
        // value per slot, so a slow heavy hitter is weighed against the quick ones it displaces
        const score=a.power*matchup(layers[0]||null,a.emotion).dmg/((a.charge||0)+1);
        if(score>bestScore){bestScore=score; best=a;}
      }
    }
    if(!placeEntries(e,best)) break;
    ec-=best.cost;
    if(shield>0) shield--;
    else if(best.hits_layer&&layers.length) layers.shift();
  }
}
function endCheck(){
  if(S.enemy.ms<=0){ Hooks.emit("unit:defeated",{unit:S.enemy,byPlayer:true});  finish("win");  return true; }
  if(S.player.ms<=0){ Hooks.emit("unit:defeated",{unit:S.player,byPlayer:false}); finish("lose"); return true; }
  return false;
}
function finish(kind){
  S.phase="OVER"; setFps(12); stopMusic(); sfx(kind);
  $("pPanel").classList.remove("overloaded");   // the fight is over; stop the alarm
  $("ePanel").classList.remove("overloaded");
  const o=document.createElement("div"); o.className="over "+kind;
  o.innerHTML=`<h1 class="hard">${kind==="win"?"LINE CLEAR":"BREAKDOWN"}</h1>
    <button class="depart pxr pxr-sh" style="width:auto;padding:13px 28px" onclick="location.reload()">RUN AGAIN</button>`;
  $("screen").appendChild(o);
}
async function depart(){
  if(S.phase!=="BUILD"||S.busy)return;
  S.busy=true; S.phase="RESOLVE";
  await Hooks.emit("round:start",{round:S.round});
  $("abilPanel").classList.remove("open");      // close the panel while the line resolves
  $("emoBtn").classList.add("rest");
  document.querySelector(".btnrow").classList.add("hide");
  renderLines(); renderStats();
  await resolveLine(S.player,S.enemy,"pLane","pTrack",true);
  await settleAll();                       // the enemy's bar takes the hits now
  if(endCheck()){S.busy=false;return;}
  await sleep(300);
  await resolveLine(S.enemy,S.player,"eLane","eTrack",false);
  await settleAll();                       // and now the player's
  if(endCheck()){S.busy=false;return;}
  commitUses(S.player); commitUses(S.enemy);   // what departed is now really spent
  await Hooks.emit("round:end",{round:S.round});
  await regrowLayers(S.player); await regrowLayers(S.enemy);
  tickCooldowns(S.player); tickCooldowns(S.enemy);
  shuffleLayers(S.player); shuffleLayers(S.enemy);
  S.round++;
  /* Each side's charging buys the OTHER side room next turn. Recomputed from
     scratch every round, so a grant lasts exactly one turn. */
  const pChg=chargeCount(S.player), eChg=chargeCount(S.enemy);
  grantBonusSlots(S.enemy,  pChg);
  grantBonusSlots(S.player, eChg);
  clearLine(S.player);
  const forced=applyOverload(S.player);
  if(forced){ bigTag("LINE INVADED","dmg"); sfx("breaklayer"); }
  buildEnemyLine();
  S.phase="BUILD"; S.busy=false;
  document.querySelector(".btnrow").classList.remove("hide");
  render();
  await announceBonusSlots();      // show where the temporary slots came from
}
$("departBtn").addEventListener("click",depart);
/* Tapping any segment removes the whole ability, charge segments included.
   Drag-reordering is off while charge groups exist — moving one would have to
   drag its charges with it. Worth restoring once the grouping is settled.  */
$("pTrack").addEventListener("click",e=>{
  if(S.phase!=="BUILD")return;
  const st=e.target.closest(".station[data-idx]"); if(!st)return;
  const idx=+st.dataset.idx, ent=S.player.line[idx]; if(!ent)return;
  if(ent.locked){ sfx("block"); return; }              // overload stations cannot be cleared
  const ab=ent.ab;
  let start=idx;
  while(start>0 && S.player.line[start-1] && S.player.line[start-1].charge
        && S.player.line[start-1].ab===ab) start--;
  let end=start;
  while(end<S.player.line.length-1 && S.player.line[end] && S.player.line[end].charge) end++;
  for(let i=start;i<=end;i++) S.player.line[i]=null;
  sfx("remove"); render();
});
$("emoBtn").addEventListener("click",()=>{
  const open=$("abilPanel").classList.toggle("open");
  $("emoBtn").classList.toggle("rest",!open);
  sfx("tap");
});
