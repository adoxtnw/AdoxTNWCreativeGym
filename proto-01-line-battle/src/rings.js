"use strict";
/* NEURO-METRO: AVUI — emotional layer rendering
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */

/* ================= LAYER RINGS =================
   Split across two canvases: the outermost layer draws alone on the top one so
   it can carry a colour-coded CSS glow, while everything behind it draws on the
   lower one and stays unlit. Outer band is thick, inner bands are thin.     */
const DARK_RING=[34,34,44], DARK_RING_HI=[66,64,90];   // empty slots breathe between these
const outerR=(pos,cfg)=>Math.max(0, cfg.baseR - pos*cfg.spacing);
function slotGeom(pos,cfg,mult){
  const o=outerR(pos,cfg), oIn=outerR(pos+1,cfg), gap=o-oIn;
  // never let a band swallow the slot inside it, however it is tuned
  const band=Math.min(gap*RULES.layerFill*mult, gap*0.92, o);
  return {outer:o, inner:Math.max(0,o-band)};
}
function rotateLayers(u){
  if(!u.layers.length) return;
  const l=u.layers.shift(); l.pos=RULES.maxLayers; u.layers.push(l);
}
function stepLayers(u){
  u.layers.forEach((l,i)=>{
    l.pos += (i-l.pos)*RULES.layerEase;
    if(Math.abs(l.pos-i)<0.004) l.pos=i;
    if(l.flash>0) l.flash--;
  });
}
function ringsOf(u,t,cfg,which){
  const rings=[];
  if(which!=="outer"){
    for(let i=u.layers.length;i<RULES.maxLayers;i++){
      // empty slots ride the same wave, but running centre -> outward, and
      // breathe between two greys instead of glowing
      const ph=t*0.22 + i*RULES.layerWaveDelay;
      const wob=Math.sin(ph)*cfg.breathe*0.55;
      const k=0.5+0.5*Math.sin(ph);
      const g=slotGeom(i,cfg,RULES.layerInnerThick);
      rings.push({outer:g.outer+wob, inner:Math.max(0,g.inner+wob),
                  col:DARK_RING.map((v,c)=>Math.round(v+(DARK_RING_HI[c]-v)*k))});
    }
  }
  u.layers.forEach((l,i)=>{
    if(which==="outer" && i!==0) return;
    if(which==="inner" && i===0) return;
    const mult = i===0 ? RULES.layerOuterThick : RULES.layerInnerThick;
    const wob=Math.sin(t*0.22 - l.pos*RULES.layerWaveDelay)*cfg.breathe;
    const g=slotGeom(l.pos,cfg,mult);
    let col = l.flash>0 ? [244,240,228] : hexRGB(EMOTIONS[l.e].hex);
    // the wobble TRANSLATES the ring; applying it unevenly squeezed thin bands
    // below one pixel and they vanished entirely
    rings.push({outer:g.outer+wob, inner:Math.max(0,g.inner+wob), col});
  });
  return rings.sort((a,b)=>b.outer-a.outer);
}
const shade=(c,f)=>c.map(v=>Math.max(0,Math.min(255,Math.round(v*f))));
function paint(ctx,W,H,cx,cy,rings){
  const mask=new Int16Array(W*H).fill(-1), edge=new Int8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const d=Math.hypot(x-cx,y-cy);
    for(let k=0;k<rings.length;k++){
      const r=rings[k];
      if(d<=r.outer&&d>=r.inner){
        mask[y*W+x]=k;
        // a lit outer edge and a shaded inner edge give each band some volume —
        // but only on bands thick enough to have an interior left over
        edge[y*W+x] = (r.outer-r.inner)>=3
          ? (d>=r.outer-1 ? 1 : (d<=r.inner+1 ? -1 : 0)) : 0;
        break;
      }
    }
  }
  const img=ctx.createImageData(W,H), D=img.data;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x,o=i*4,k=mask[i]; let col=null;
    if(k>=0){
      col=rings[k].col;
      if(edge[i]===1) col=shade(col,1.30);
      else if(edge[i]===-1) col=shade(col,0.58);
    }
    else if(x>0&&y>0&&mask[i-W-1]>=0) col=[12,10,22];
    if(col){D[o]=col[0];D[o+1]=col[1];D[o+2]=col[2];D[o+3]=255;}
  }
  ctx.putImageData(img,0,0);
}
const CV={
  eIn :$("sprIn").getContext("2d"),  eOut:$("sprOut").getContext("2d"),
  pIn :$("pRingsIn").getContext("2d"), pOut:$("pRingsOut").getContext("2d")
};
const EW=64, PW=RULES.playerCanvasW, PH=RULES.playerCanvasH;
["sprIn","sprOut"].forEach(id=>{$(id).width=$(id).height=EW;});
["pRingsIn","pRingsOut"].forEach(id=>{$(id).width=PW; $(id).height=PH;});
const E_CFG={baseR:RULES.enemyRingBaseR,  spacing:RULES.enemyRingSpacing,  breathe:RULES.enemyRingBreathe};
const P_CFG={baseR:RULES.playerRingBaseR, spacing:RULES.playerRingSpacing, breathe:RULES.playerRingBreathe};
let t=0, frozen=false, timer=null, glowCache={};
let stepMs=1000/12, acc=0, lastTs=0, rafId=0, lastTickAt=0, watchdog=null;
function applyGlow(el,u,px){
  const e=u.layers.length?u.layers[0].e:null;
  const key=el.id+":"+e;
  if(glowCache[el.id]===key) return;
  glowCache[el.id]=key;
  el.style.filter = e
    ? `drop-shadow(0 0 ${px}px ${emoHex(e)}) drop-shadow(0 0 ${px*2.2}px ${emoHex(e)}88)`
    : "none";
}
function tick(){
  if(frozen)return;
  t++; stepLayers(S.enemy); stepLayers(S.player);
  gaugePhase = t;                       // the bar's waves ride the same clock
  if(S.enemy.hurtFlash>0)  S.enemy.hurtFlash--;
  if(S.player.hurtFlash>0) S.player.hurtFlash--;
  redrawGauges();                       // canvas bars repaint every frame
  const ec=EW/2, pcx=PW/2, pcy=RULES.playerRingCy;
  paint(CV.eIn ,EW,EW,ec ,ec ,ringsOf(S.enemy ,t,E_CFG,"inner"));
  paint(CV.eOut,EW,EW,ec ,ec ,ringsOf(S.enemy ,t,E_CFG,"outer"));
  paint(CV.pIn ,PW,PH,pcx,pcy,ringsOf(S.player,t,P_CFG,"inner"));
  paint(CV.pOut,PW,PH,pcx,pcy,ringsOf(S.player,t,P_CFG,"outer"));
  applyGlow($("sprOut"),S.enemy,4);
  const fl=$("floorLight"), oe=S.enemy.layers.length?S.enemy.layers[0].e:null;
  if(fl && fl.dataset.e!==String(oe)){ fl.dataset.e=String(oe); fl.style.color=emoHex(oe); }
  applyGlow($("pRingsOut"),S.player,4);
}
/* A fixed step driven by requestAnimationFrame, with a timer as backstop.
   setInterval(tick, 83) on its own drifts: measured gaps averaged 115ms and
   spiked to 334ms against a nominal 83ms, which is what made the animation read
   as skippy and jump at the end of a move. rAF lands the step on real compositor
   frames instead, and the accumulator is clamped to one step so a long stall
   cannot spiral into a burst of catch-up ticks.
   But rAF is SUSPENDED OUTRIGHT on a hidden tab — not throttled, stopped — which
   would freeze the bar tweens mid-resolution. So a watchdog timer keeps stepping
   the clock whenever rAF has gone quiet. Visible: rAF drives and the watchdog
   never fires. Hidden: the watchdog alone keeps the simulation moving. */
function step(){ lastTickAt = performance.now(); tick(); }
function frame(ts){
  rafId = requestAnimationFrame(frame);
  if(!lastTs){ lastTs = ts; return; }
  acc += ts - lastTs; lastTs = ts;
  if(acc < stepMs) return;
  acc = Math.min(acc - stepMs, stepMs);      // never bank more than one frame
  step();
}
function setFps(f){
  stepMs = 1000/f;
  if(!rafId){ lastTs = 0; acc = 0; rafId = requestAnimationFrame(frame); }
  if(watchdog) clearInterval(watchdog);
  watchdog = setInterval(()=>{
    if(performance.now() - lastTickAt > stepMs * 2.5) step();
  }, stepMs);
  timer = watchdog;                          // truthy while the clock is running
}
step(); setFps(12);
