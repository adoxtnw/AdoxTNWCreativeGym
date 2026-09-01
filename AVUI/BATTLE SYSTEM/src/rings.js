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
  /* `cfg.fill` lets one unit run thicker bands than the sheet's default. It
     exists for the shaped enemies: a triangle or a star squeezes every band's
     PIXEL thickness by its own narrowness, and the thin inner rings went under
     one pixel and broke into dashes. Measured, not guessed — see the ring
     continuity check in the README. Circles pass nothing and are unchanged. */
  const fill=(cfg.fill==null?RULES.layerFill:cfg.fill);
  // never let a band swallow the slot inside it, however it is tuned
  const band=Math.min(gap*fill*mult, gap*0.92, o);
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

/* ================= SILHOUETTES =================
   An enemy's TIER is not a stat, it is a shape: a weak one wears concentric
   triangles and a strong one concentric seven-pointed stars, so what you are
   walking into is legible from the sprite before a single number is shown.

   ONE FUNCTION CHANGES, NOT THE RENDERER. `paint` already decides which band a
   pixel is in by asking how far it is from the centre; every shape here is
   just a different answer to that question. A ring at radius 28 is still a ring
   at radius 28 — it is the DISTANCE that is stretched, by a factor that depends
   only on the angle:

       distance = hypot(dx,dy) / f(angle),      f in (0,1]

   f is 1 where the shape reaches furthest (a vertex, a star's point) and less
   than 1 everywhere else, so every shape is INSCRIBED in the circle the rings
   were tuned for. Nothing about layer geometry, breathing or spacing has to
   know any of this, and the player's rings, which pass no shape at all, are
   exactly the circles they have always been.

   WHY THE TRIANGLE IS ROUNDED. Bands are constant in shape space, so their
   thickness in PIXELS is multiplied by f. A true triangle has f = 0.5 along the
   flats, which puts the thin inner rings (about 1.8px) under one pixel there —
   they break into dashes and then vanish. `enemyTriRound` pulls f up toward the
   circle until they survive. It is legibility, not taste. */
const TAU=Math.PI*2;
/* A rules cell, with a fallback. Deliberately NOT called `num`: view.js already
   uses that name for a local, and a global with the same name is a trap. */
const rv=(v,d)=>(v===""||v==null||isNaN(+v))?d:+v;
function polyF(a,n,round){
  const seg=TAU/n, m=((a%seg)+seg)%seg - seg/2;
  const f=Math.cos(Math.PI/n)/Math.cos(m);              // 1 at a vertex
  return 1-(1-f)*round;                                  // ...pulled back toward a circle
}
function starF(a,n,inner){
  const seg=TAU/n, m=((a%seg)+seg)%seg;
  /* a triangle wave: 1 at the point, `inner` at the valley between two points */
  const k=Math.abs(m/seg*2-1);
  return inner+(1-inner)*k;
}
/* Returns null for a circle, so the common case costs nothing at all.
   `-PI/2` puts a vertex at twelve o'clock: atan2 measures from the +x axis, so
   without it the triangle sits on a corner pointing right, which reads as an
   arrow aimed off-screen rather than as something facing you. */
const SHAPE_UP=-Math.PI/2;
function shapeF(kind,spin){
  spin=(spin||0)+SHAPE_UP;
  if(kind===RULES.enemyShapeWeak && kind==="TRIANGLE")
    return a=>polyF(a-spin,3,rv(RULES.enemyTriRound,0.72));
  if(kind===RULES.enemyShapeStrong && kind==="STAR")
    return a=>starF(a-spin,Math.max(3,rv(RULES.enemyStarPoints,7)),rv(RULES.enemyStarInner,0.62));
  return null;
}
/* WEAK / REGULAR / STRONG -> what that tier is drawn as, and how big. Both come
   off the rules sheet, and an unknown tier falls through to the circle rather
   than throwing — a units row with a typo in it should look ordinary, not crash
   the fight. */
const tierShape = u => ({WEAK:RULES.enemyShapeWeak, STRONG:RULES.enemyShapeStrong})[u.tier]
                       || RULES.enemyShapeRegular;
const tierScale = u => u.tier==="WEAK"   ? rv(RULES.enemyRingScaleWeak,0.85)
                     : u.tier==="STRONG" ? rv(RULES.enemyRingScaleStrong,1.05) : 1;

function paint(ctx,W,H,cx,cy,rings,shape){
  const mask=new Int16Array(W*H).fill(-1), edge=new Int8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const dx=x-cx, dy=y-cy;
    const d=shape ? Math.hypot(dx,dy)/shape(Math.atan2(dy,dx)) : Math.hypot(dx,dy);
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
/* The enemy's ring geometry is REBUILT PER FIGHT, because a weak one is smaller
   and a strong one bigger. Spacing scales with the radius, or a strong enemy
   would simply have wider bands rather than being a larger creature. */
const enemyCfg = u => {
  const k=tierScale(u), shaped=tierShape(u)!==RULES.enemyShapeRegular;
  return {baseR:  RULES.enemyRingBaseR   * k,
          spacing:RULES.enemyRingSpacing * k,
          breathe:RULES.enemyRingBreathe * (shaped ? rv(RULES.enemyShapeBreathe,0.5) : 1),
          /* Only a shaped enemy thickens its bands, and only because it has to. */
          fill:   RULES.layerFill * (shaped ? rv(RULES.enemyShapeFill,1.6) : 1)};
};
let E_CFG=enemyCfg(S.enemy);
/* CALL THIS WHENEVER `S.enemy` IS REPLACED. The geometry is built once per fight
   rather than once per frame, so a new enemy arriving from the map would
   otherwise be drawn at the size of the one this page booted with. */
function refreshEnemyShape(){
  E_CFG=enemyCfg(S.enemy); glowCache={};
  /* HOW BIG THIS ONE IS DRAWN. Not part of the ring geometry: the canvas is 64
     pixels across and the rings already breathe out to its edge, so scaling the
     GEOMETRY would push a big enemy straight through the buffer wall and clip
     it. The sprite is drawn at its own resolution and DISPLAYED larger, which is
     also the only way a boss can overhang the arena — which is the point of it
     being bigger. */
  /* SET ON THE HOLDER so it INHERITS to both children. `.sprwrap` needs it to
     size itself and `.personaname` needs it to know how far the entity now
     overhangs upward — and the name is a sibling of the sprite, not a child, so
     a property set on the sprite would never reach it. */
  const holder=document.querySelector(".enemyholder") || document.querySelector(".sprwrap");
  if(holder) holder.style.setProperty("--esc", (S.enemy.scale||1).toFixed(3));
}
const P_CFG={baseR:RULES.playerRingBaseR, spacing:RULES.playerRingSpacing, breathe:RULES.playerRingBreathe};
let t=0, frozen=false, timer=null, glowCache={};
let stepMs=1000/12, acc=0, lastTs=0, rafId=0, lastTickAt=0, watchdog=null;
let rampX=0;
const RAMP_STEP=2;                       // px per frame
/* the loop is a third of the viewport, matching --rampW */
const rampLoopPx=()=>Math.max(1, window.innerWidth/3);
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
  /* ONE ramp position for the whole document. Every `.ramp` element reads this,
     so a tag, a border and a number are always showing the same slice of the same
     sheet. Per-element CSS animations drifted out of phase with each other and
     cost one animation per element; this is a single custom-property write. */
  rampX = (rampX - RAMP_STEP) % rampLoopPx();
  document.documentElement.style.setProperty("--rampPos", rampX.toFixed(1) + "px");
  if(S.enemy.hurtFlash>0)  S.enemy.hurtFlash--;
  if(S.player.hurtFlash>0) S.player.hurtFlash--;
  redrawGauges();                       // canvas bars repaint every frame
  const ec=EW/2, pcx=PW/2, pcy=RULES.playerRingCy;
  /* The silhouette turns slowly. A polygon that never moves reads as a logo;
     the same polygon drifting a fraction of a degree a frame reads as a
     creature holding still. Circles pass null and are unaffected. */
  const eShape=shapeF(tierShape(S.enemy), t*rv(RULES.enemyShapeSpin,0.018));
  paint(CV.eIn ,EW,EW,ec ,ec ,ringsOf(S.enemy ,t,E_CFG,"inner"),eShape);
  paint(CV.eOut,EW,EW,ec ,ec ,ringsOf(S.enemy ,t,E_CFG,"outer"),eShape);
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
