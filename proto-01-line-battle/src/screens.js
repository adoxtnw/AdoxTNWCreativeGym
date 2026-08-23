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
/* The intro line, rasterised by hand at 1/PX scale so every edge lands on a
   whole pixel. ctx.arc would anti-alias the rings back into smoothness, so the
   circles are tested per pixel instead. */
function drawIntroLine(cv, count, spacing){
  const PX = 6;                                   // CSS pixels per drawn pixel
  const W = Math.round(3200/PX), H = Math.round(96/PX);
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(W, H), D = img.data;
  const cy = H/2, railH = 12/PX;                  // rail thickness
  const rOut = 78/(2*PX), rIn = (78-24)/(2*PX);   // station ring: 12px border both sides
  const put = (x,y) => { if(x<0||x>=W||y<0||y>=H) return;
    const o=(y*W+x)*4; D[o]=D[o+1]=D[o+2]=255; D[o+3]=255; };
  for(let x=0;x<W;x++){
    for(let y=0;y<H;y++){
      if(Math.abs(y+0.5-cy) <= railH/2) put(x,y);     // the rail
    }
  }
  for(let i=0;i<count;i++){
    const sx = 1600/PX + (i*spacing)/PX;             // track x=0 sits at the middle
    for(let y=0;y<H;y++){
      for(let x=Math.floor(sx-rOut)-1; x<=Math.ceil(sx+rOut)+1; x++){
        const dx=x+0.5-sx, dy=y+0.5-cy, d=Math.sqrt(dx*dx+dy*dy);
        if(d<=rOut && d>=rIn) put(x,y);              // ring
        else if(d<rIn){                              // hollow centre, punched out
          const o=((y*W+x)*4); if(x>=0&&x<W){ D[o]=D[o+1]=D[o+2]=0; D[o+3]=255; }
        }
      }
    }
  }
  ctx.putImageData(img,0,0);
}

/* The circular wipe, as an actual MASK.
   It used to be a black disc growing on a black field — which is why it never
   read as revealing anything. Now the curtain itself is this canvas: opaque
   black everywhere, TRANSPARENT inside the circle, so what appears in the hole
   is the real battle background behind it. The leading edge is a thick ring
   drawn at the same 1/PX scale as the metro line, so its stroke is pixelated and
   heavy rather than a hairline. */
function wipeReveal(ms){
  const cv=$("introWipe"), sr=$("screen").getBoundingClientRect();
  const PX=6, RING=4;                            // RING logical px = 24 CSS px
  const W=Math.ceil(sr.width/PX), H=Math.ceil(sr.height/PX);
  cv.width=W; cv.height=H;
  cv.style.width=(W*PX)+"px"; cv.style.height=(H*PX)+"px";
  const ctx=cv.getContext("2d");
  const cx=W/2, cy=H/2, maxR=Math.sqrt(cx*cx+cy*cy)+RING+2;
  $("intro").classList.add("masking");           // the canvas is the black now
  const t0=performance.now();
  return new Promise(res=>{
    let done=false;
    const finish=()=>{ if(done) return; done=true; clearInterval(iv); clearTimeout(safety); res(); };
    const draw=()=>{
      const k=Math.min(1,(performance.now()-t0)/ms);
      const r=k*k*maxR;                           // accelerates, like the old easing
      const img=ctx.createImageData(W,H), D=img.data;
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        const dx=x+0.5-cx, dy=y+0.5-cy, d=Math.sqrt(dx*dx+dy*dy), o=(y*W+x)*4;
        if(d < r-RING) continue;                  // revealed: left fully transparent
        if(d < r){ D[o]=D[o+1]=D[o+2]=255; D[o+3]=255; }   // the thick leading ring
        else     { D[o+3]=255; }                  // still curtained (opaque black)
      }
      ctx.putImageData(img,0,0);
      if(k>=1){ ctx.clearRect(0,0,W,H); finish(); }
    };
    /* A timer, not rAF: rAF is suspended outright on a hidden tab and the opening
       would hang there for ever. The safety timeout is the same insurance. */
    const iv=setInterval(draw, 16);
    const safety=setTimeout(()=>{ ctx.clearRect(0,0,W,H); finish(); }, ms+600);
    draw();
  });
}

/* Each interface element is drawn into place like a blade leaving its sheath:
   a hard directional wipe with a bright edge, stepped so it reads at 12 fps.
   The enemy's arrive first and from above, pitched lower; yours follow from
   below, pitched higher. They overlap — the next starts before the last lands. */
async function unsheath(el, fromTop, sound){
  const dir = fromTop ? -1 : 1;
  el.style.willChange="clip-path,transform,filter";
  el.classList.remove("drawin");        // hidden until exactly this moment
  sfx(sound);
  const anim = el.animate([
    { clipPath: fromTop ? "inset(0 0 100% 0)" : "inset(100% 0 0 0)",
      transform:`translateY(${dir*-16}px)`, filter:"brightness(3.4)", opacity:1 },
    { clipPath: fromTop ? "inset(0 0 38% 0)"  : "inset(38% 0 0 0)",
      transform:`translateY(${dir*-6}px)`,  filter:"brightness(2.1)", offset:.45 },
    { clipPath:"inset(0 0 0 0)", transform:"translateY(0)", filter:"brightness(1)" }
  ], { duration: RULES.unsheathMs, easing:"cubic-bezier(.1,.85,.25,1)", fill:"both" });
  await waitAnim(anim, RULES.unsheathMs);
  el.style.willChange="";
}

async function revealInterface(){
  const q = sel => document.querySelector(sel);
  /* Top-down for the enemy, then bottom-up for the player — the order the eye
     travels, not DOM order. */
  const enemy  = [q("#ePanel"), q("#eStatus"), q("#eLane") && q("#eLane").closest(".lane-wrap")];
  const player = [q("#pPanel"), q(".btnrow"), q("#pStatus"),
                  q("#pLane") && q("#pLane").closest(".lane-wrap"), q("#pstrip")];
  /* Hide them all BEFORE the blackout lifts. Removing `preintro` reveals every
     element at once, so without this the later ones sat fully visible for
     hundreds of milliseconds and then animated — which is what read as a flash
     followed by things moving around for no reason. */
  const all = [...enemy, ...player].filter(Boolean);
  all.forEach(el => el.classList.add("drawin"));
  $("screen").classList.remove("preintro");

  const runs=[];
  for(const el of enemy.filter(Boolean)){
    runs.push(unsheath(el, true, "sheatheE"));
    await sleep(RULES.unsheathGapMs);            // overlap: do not wait for it to land
  }
  for(const el of player.filter(Boolean)){
    runs.push(unsheath(el, false, "sheatheP"));
    await sleep(RULES.unsheathGapMs);
  }
  await Promise.all(runs);
}

async function intro(){
  const track=$("introTrack"), wipe=$("introWipe"), banner=$("banner");
  /* The stage is exempt from the preintro blackout (the enemy has to be able to
     rise while it is still on), which meant the entity sat there fully visible
     BEHIND the curtain — the wipe then revealed it early, and the rise animation
     restarting from opacity:0 read as it flashing away. Nothing may be waiting
     behind the hole except the background itself. */
  $("stage").style.opacity="0";
  // four stations strung along the diagonal, the last one landing dead centre
  const SP=210;
  drawIntroLine($("introCv"), 4, SP);
  await waitAnim(track.animate(
    [{transform:`translateY(-50%) translateX(${-(3*SP)-560}px)`},
     {transform:"translateY(-50%) translateX(0px)"}],
    {duration:1650, easing:"cubic-bezier(.12,.72,.22,1)", fill:"forwards"}), 1650);
  await sleep(200);

  sfx("clash");
  await wipeReveal(880);
  await sleep(120);

  // everything is black now — swap the intro away and let the enemy rise into it
  $("intro").classList.add("clear");
  track.innerHTML=""; wipe.style.display="none";
  const stage=$("stage");
  stage.style.opacity="1";
  /* Scale the HOLDER, not the stage. `.stage` is flex:1 and far taller than the
     entity, so scaling it pivots about the stage's centre — which read as the
     entity growing out of its own bottom-left corner. The holder's box is the
     sprite's box (the persona name is absolutely positioned), so its centre is
     the entity's centre. */
  const riser=document.querySelector(".enemyholder") || stage;
  await waitAnim(riser.animate([
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
  riser.style.transform="";

  // the name resolves over the enemy, one letter at a time
  await typeName();

  await speak(S.enemy.persona && S.enemy.persona.lines.INTRO, S.enemy.emotion);

  // and only now does the interface arrive
  $("floorWrap").classList.add("lit");
  $("intro").remove();
  await revealInterface();        // it lifts the blackout itself, once things are hidden
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


/* ================= BARCELONA'S CURRENT MOMENT =================
   The title screen names the hour the way a person would.

   The clock comes from Intl with `timeZone: "Europe/Madrid"`, NOT from a network
   time service. That is deliberate: it reads Barcelona's real local time — right
   through the DST changes, from the browser's own IANA database — for every
   player whatever timezone they are sitting in, it costs nothing, and it still
   works with the page opened straight off disk. A remote clock would be one more
   thing to fail and would not be any more correct. Swap `barcelonaNow()` if you
   ever do want a networked source; nothing else needs to change.

   The phrases themselves live in the `moments` sheet, never here. */
const WEEKDAY_ID = ["SUN","MON","TUE","WED","THU","FRI","SAT"];

function barcelonaNow(){
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone:"Europe/Madrid", weekday:"long", hour:"numeric", hour12:false });
  const parts = Object.fromEntries(f.formatToParts(new Date()).map(p=>[p.type,p.value]));
  const hour = parseInt(parts.hour, 10) % 24;
  const long = parts.weekday;                       // "Friday"
  const idx  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
                 .indexOf(long);
  return { hour, weekday: long, day: WEEKDAY_ID[idx] || "*" };
}

/* A band may wrap past midnight (22 -> 5), so the test is not a plain range. */
const inBand = (h, a, b) => a <= b ? (h >= a && h < b) : (h >= a || h < b);

function pickMoment(now){
  const hits = MOMENTS.filter(m => inBand(now.hour, m.from_hour, m.to_hour)
                               && (m.day === "*" || m.day === now.day));
  if(!hits.length) return null;
  const top = Math.max(...hits.map(m => m.priority || 0));   // a day-specific line wins
  const best = hits.filter(m => (m.priority || 0) === top);
  return best[Math.floor(Math.random() * best.length)];
}

function renderMoment(){
  const el = $("momentLine"); if(!el) return;
  const now = barcelonaNow(), m = pickMoment(now);
  el.textContent = m ? `Barcelona, ${now.weekday}, ${m.phrase}.`
                     : `Barcelona, ${now.weekday}.`;
}
