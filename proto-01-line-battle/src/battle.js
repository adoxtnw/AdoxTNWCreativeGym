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

/* Flash a whole line white, to say "this one is about to run". */
async function alertLine(lane){
  for(let i=0;i<RULES.lineAlertFlashes;i++){
    lane.classList.add("alert");  await sleep(RULES.lineAlertMs);
    lane.classList.remove("alert"); await sleep(RULES.lineAlertMs);
  }
}
/* Every station fires dead centre of the lane. The whole line is parked off to
   one side first and then travels across, so the motion always reads the same way
   — yours enters from the left and moves right, the enemy's mirrors it — instead
   of the track jumping back and forth to whichever station happens to be next. */
/* The station's centre, in LANE coordinates, is the track's own offset inside the
   lane plus the station's offset inside the track. Leaving out the track offset was
   why nothing landed in the middle: `.lane` centres its track, so the track starts
   ~100px in, and every station was off by exactly that much. */
function stationCentre(track,st){ return track.offsetLeft + st.offsetLeft + st.offsetWidth/2; }
function centerStation(lane,track,st){
  const tx=lane.clientWidth/2 - stationCentre(track,st);
  track.style.transform=`translateX(${Math.round(tx)}px)`;
}
/* Park the line clear of the centre, on the side it will travel FROM. */
function parkLine(unit,lane,track){
  const first=track.querySelector(".station[data-idx]");
  const w=lane.clientWidth;
  const base=first ? w/2 - stationCentre(track,first) : 0;
  const off=(unit.dir>0 ? -1 : 1) * (w*0.5 + 40);
  track.style.transition="none";
  track.style.transform=`translateX(${Math.round(base+off)}px)`;
  void track.offsetWidth;                       // commit before the travel begins
  track.style.transition="";
}
/* Charging costs only TIME now. It used to fire the opponent's next station out of
   turn (chaos), and then to buy the opponent a temporary slot (legible, but it made
   every heavy attack a gift). Both are retired: a charge segment simply occupies a
   slot and delays what follows. Extra slots still exist, but they are earned by
   criticals or forced by Overload — see `unit.extra`. */
async function resolveLine(actor,target,laneId,trackId,onEnemy){
  const lane=$(laneId),track=$(trackId);
  if(actor.stunned > 0){
    /* No tag here. Breaking the last layer already threw the big colour-coded
       STUNNED, and this fires in the same round — two tags for one event. The
       sound and the skipped line carry it. */
    sfx("block");
    await sleep(700);
    return;                                   // it reels; the line simply does not run
  }
  if(slotsUsed(actor)===0){
    actor.ec+=RULES.restEc; actor.shownEc=actor.ec; sfx("regrow"); renderStats(); await sleep(800); return;
  }
  const cost=lineCost(actor);
  actor.ec-=cost; actor.shownEc=actor.ec; renderStats(); sfx("depart");
  await Hooks.emit("line:depart",{unit:actor,cost});
  await sleep(360);
  /* Three white flashes on the line about to run, so the eye is already there
     when the first station fires. */
  await alertLine(lane);
  lane.classList.add("zoom");
  parkLine(actor,lane,track);                   // start off-centre, on the near side
  await sleep(180);
  let chargeRun=0;
  while(actor.cursor < actor.line.length){
    if(S.player.ms<=0||S.enemy.ms<=0) break;
    const i=actor.cursor;
    const entry=actor.line[i];
    if(!entry){ actor.cursor++; continue; }
    const st=track.querySelector(`.station[data-idx="${i}"]`);
    if(st && !st.classList.contains("spent")) centerStation(lane,track,st);
    else { actor.cursor++; continue; }           // already spent by an interrupt
    const stepT0 = performance.now();
    /* WAIT for the slide to finish. The station has to actually BE in the middle
       before it lights up and throws its symbol — firing 40ms after asking the
       track to move meant the symbol left from wherever the line happened to be
       mid-travel, which is why it appeared to come from behind the bar. */
    await sleep(RULES.lineTravelMs);
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

    sfx("arrive"); await sleep(RULES.lineFlashMs);
    await applyAbility(actor,target,entry.ab,onEnemy,st);
    chargeRun=0;
    st.classList.remove("active"); st.classList.add("spent");
    actor.cursor++;
    /* One station = attackStepMs, whatever the ability spent on its own
       animations. Padding to a deadline rather than adding fixed sleeps keeps
       the rhythm even across abilities that do very different amounts of work. */
    /* A station that hands out a status holds far longer, so the player can read
       what just happened; everything else keeps the brisk attack rhythm. */
    const budget = entry.ab.status_apply ? RULES.statusStepMs : RULES.attackStepMs;
    const spentMs = performance.now() - stepT0;
    if(spentMs < budget) await sleep(budget - spentMs);
  }
  /* The line RUNS OUT the far side instead of snapping home. Cutting straight
     back to zero was the jump between the last station and the turn changing
     hands — the motion simply stopped mid-travel. */
  const outW = lane.clientWidth;
  track.style.transform = `translateX(${Math.round(actor.dir>0 ? outW : -outW)}px)`;
  await sleep(300);
  lane.classList.remove("zoom");
  track.style.transition="none";                 // reset unseen, once it is off-screen
  track.style.transform="translateX(0)";
  void track.offsetWidth;
  track.style.transition="";
  await sleep(200);
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
  /* Debuffs are worth a slot only if the target is not already suffering them.
     Without this the AI never touches a DEBUFF at all — its scoring is built on
     damage per slot, and a debuff deals none, so it would always lose the
     comparison and an ability like Blinded by Hate would sit in the pool unused. */
  const affordable=a=>a.cost<=ec && ((a.charge||0)+1)<=emptySlots(e)
                      && cooldownLeft(e,a.id)===0 && usesLeft(e,a)>0;
  const debuffs=e.pool.filter(a=>a.kind==="DEBUFF" && affordable(a) && !hasStatus(p,a.status_apply));
  if(debuffs.length && Math.random()<RULES.aiDebuffChance){
    const d=debuffs[Math.floor(Math.random()*debuffs.length)];
    if(placeEntries(e,d)) ec-=d.cost;
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
/* SAD and anything else carrying `self_hits`: at the end of the round the victim
   turns one of its OWN attacks on itself. Restricted to DAMAGE abilities on
   purpose — "one of their abilities" picked from the whole pool would sometimes
   hand them a shield, which is not a punishment. */
async function runSelfHits(u, onEnemy){
  let n = 0;
  for(const k in u.statuses) if(u.statuses[k] > 0 && STATUSES[k]) n += (STATUSES[k].self_hits || 0);
  if(!n) return;
  const pool = u.pool.filter(a => a.kind === "DAMAGE");
  if(!pool.length) return;
  for(let i = 0; i < n; i++){
    if(u.ms <= 0) return;
    const ab = pool[Math.floor(Math.random() * pool.length)];
    unitTag(u, "SELF HARM", emoHex("SADNESS"));     // over the sufferer, so two are two
    await applyAbility(u, u, ab, !onEnemy, null);   // actor and target are the same unit
    await settle(u);
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
  closePanel();                                 // no building while the line resolves
  $("screen").classList.add("resolving");
  renderLines(); renderStats();
  await resolveLine(S.player,S.enemy,"pLane","pTrack",true);
  await settleAll();                       // the enemy's bar takes the hits now
  if(endCheck()){S.busy=false;return;}
  await sleep(300);
  await resolveLine(S.enemy,S.player,"eLane","eTrack",false);
  await settleAll();                       // and now the player's
  if(endCheck()){S.busy=false;return;}
  commitUses(S.player); commitUses(S.enemy);   // what departed is now really spent
  await runSelfHits(S.enemy, true);
  if(endCheck()){S.busy=false;return;}
  await runSelfHits(S.player, false);
  if(endCheck()){S.busy=false;return;}
  await Hooks.emit("round:end",{round:S.round});
  await regrowLayers(S.player); await regrowLayers(S.enemy);
  tickCooldowns(S.player); tickCooldowns(S.enemy);
  tickStatuses(S.player);  tickStatuses(S.enemy);
  /* After regrowLayers has already been skipped for this turn. */
  if(S.player.stunned>0) S.player.stunned--;
  if(S.enemy.stunned>0)  S.enemy.stunned--;
  shuffleLayers(S.player); shuffleLayers(S.enemy);
  S.round++;
  /* A slot earned by a critical is good for exactly one line. It is granted the
     moment the crit lands (so it can be seen flying in), so the sweep keeps a
     FRESH one — it has not been built with yet — and clears anything older. */
  [S.player, S.enemy].forEach(u => {
    if(u.critFresh) u.critFresh = false;      // survives into the line about to be built
    else dropExtra(u, "CRIT");                // already had its line
  });
  clearLine(S.player);
  const forced=applyOverload(S.player);
  if(forced){ bigTag("LINE INVADED","dmg"); sfx("breaklayer"); }
  buildEnemyLine();
  S.phase="BUILD"; S.busy=false;
  $("screen").classList.remove("resolving");
  newPrompt();
  render();
  await announceBonusSlots();      // show where the temporary slots came from
}
/* DEPART is a button of its own again, sitting above the line and appearing only
   once there is something to send. The terminus arrow is back to being purely a
   direction indicator. */
$("departBtn").addEventListener("click",()=>{
  if(S.phase!=="BUILD"||S.busy) return;
  $("departBtn").classList.remove("show");     // gone the moment it is used
  depart();
});
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
/* The line itself is the way in: tap any empty stretch of it to open Emotions.
   Tapping a station still removes it, and tapping the terminus departs, so this
   only fires when neither of those was hit. */
$("pLane").addEventListener("click",e=>{
  if(S.phase!=="BUILD"||S.busy) return;
  if(e.target.closest(".station[data-idx]")) return;
  togglePanel();
});
