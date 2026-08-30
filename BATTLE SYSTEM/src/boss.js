"use strict";
/* NEURO-METRO: AVUI — what a Line Manager does that nothing else does
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   THIS IS KEYED OFF A COLUMN, NOT OFF AN ID. `units.role` is LINE_MANAGER, and
   everything here reads that — so the other five inherit the whole sequence
   from one cell each, and none of it has to be written again. There is exactly
   one line manager in the sheet today; there is nothing in this file that knows
   which one.

   TWO SET PIECES:

     THE SECOND WIND. She cannot be killed below `bossPhaseAt`. The music and
     the interface go, she says what she is, the screen flashes, and she pulls
     herself back to `bossPhaseTo` over five whole seconds — which is the fight
     being taken away from you and then handed back, on purpose. A different
     song comes in behind the second phase.

     THE FALL. No particle burst and no clash: the music simply stops, she gets
     two parting lines rather than one, and then she shakes and sinks off the
     bottom of the screen over seven seconds. A thing that was the embodiment of
     an emotion does not pop.

   WHY THE GATE INTERCEPTS THE KILLING BLOW. "At 20%" cannot mean "when the bar
   happens to land on 20%" — a heavy hit goes from 34% to below zero and never
   passes through it, and she would simply die with her set piece unplayed. So
   the test is `ms <= 20%`, which includes dead, and the first thing the gate
   does is put her back ON the line. Below that line she is not killable until
   the second wind has happened; after it, she is an ordinary fight again.   */

const isLineManager = u => !!u && u.role === "LINE_MANAGER";

/* Everything except the arena and the player's own layers. `speak()` hangs its
   bubble on #screen, so the bubble is exempt too — the whole point of the hush
   is that she is the only thing left talking. */
function hushInterface(on){
  $("screen").classList.toggle("hush", !!on);
}

/* Called wherever her stamina may just have moved. Returns true if it took over
   — the caller must then stop what it was doing, because the fight it was in
   the middle of resolving no longer exists in the same shape. */
async function bossPhaseGate(){
  const e = S.enemy;
  if(!isLineManager(e) || e.phase2 || e.phaseBusy) return false;
  const floor = e.maxMs * rv(RULES.bossPhaseAt, 0.2);
  if(e.ms > floor) return false;

  e.phaseBusy = true;
  /* BACK ONTO THE LINE FIRST. She may have arrived here from below zero. */
  e.ms = floor; e.shownMs = Math.round(floor); e.pending = [];
  renderStats();

  /* everything stops: the theme, the interface, and the fight itself */
  stopMusic(rv(RULES.bossHushMs, 520));
  hushInterface(true);
  await sleep(rv(RULES.bossHushMs, 520));

  sfx("boss_roar");
  const P = e.persona;
  if(P && P.lines && P.lines.PHASE2) await speak(P.lines.PHASE2, e.emotion);
  else await sleep(900);

  await whiteFlash(Math.max(1, rv(RULES.bossFlashes, 4) | 0));
  hushInterface(false);

  /* THE RECHARGE IS WATCHED, NOT REPORTED. Five seconds of a bar climbing is a
     long time to hold an interface still, and that is the point — you are made
     to sit and watch it come back. Driven on the display clock rather than the
     12 fps one so the climb is smooth: this is direct manipulation of a value,
     like the map's camera tweens, not an animation of the game state. */
  const to = e.maxMs * rv(RULES.bossPhaseTo, 0.5);
  const ms = rv(RULES.bossRechargeMs, 5000);
  sfx("boss_charge");
  $("ePanel").classList.add("recharging");
  await new Promise(res => {
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      e.ms = floor + (to - floor) * k;
      e.shownMs = Math.round(e.ms);
      renderStats();
      if(k >= 1){ res(); return; }
      requestAnimationFrame(step);
    };
    step();
  });
  $("ePanel").classList.remove("recharging");
  e.ms = to; e.shownMs = Math.round(to);
  /* SHE COMES BACK IN CONTROL. Charge is measured against the MS ceiling, and
     halving her ceiling left whatever she had been holding sitting above it —
     so the boss who had just declared herself the embodiment of an emotion came
     back OVERLOADED and started feeding the player and hurting herself. The
     rule is right (charge over stamina is loss of control) and this is a real
     consequence of it; it is simply the wrong moment for it. She keeps her
     charge, up to what she can now hold. */
  e.ec = Math.min(e.ec, to); e.shownEc = Math.round(e.ec);
  applyOverload(e);
  renderStats();

  await whiteFlash(1);
  /* SET BEFORE THE MUSIC, because `themeNow()` reads it. */
  e.phase2 = true;
  refreshEnemyShape();                 /* nothing changes shape today; a hook for when it does */
  try{ audioAwake(); startMusic(); }catch(err){}
  bigTag("SECOND PHASE", "dmg");
  e.phaseBusy = false;
  return true;
}

/* ---- THE FALL ---------------------------------------------------------------
   Replaces `enemyCollapse()` and the clash burst for a Line Manager. Slower than
   anything else in the game on purpose: seven seconds of something shaking its
   way off the bottom of the screen is the fight refusing to end cleanly.     */
async function lineManagerFall(){
  const e = S.enemy;
  stopMusic(200);
  bubbleToken++;                       /* cut off anything mid-sentence */
  const P = e.persona;
  if(P && P.lines && P.lines.DEFEAT)  await speak(P.lines.DEFEAT,  e.emotion);
  if(P && P.lines && P.lines.DEFEAT2) await speak(P.lines.DEFEAT2, e.emotion);

  const wrap = document.querySelector(".sprwrap");
  const sr = $("screen").getBoundingClientRect();
  const ms = rv(RULES.bossSinkMs, 7000);
  if(wrap){
    const esc = e.scale || 1;
    /* THE SHAKE IS A SEPARATE, FASTER LAYER under the sink. One keyframe list
       doing both would have to spell out every jitter at every depth, and the
       jitter has to be fast while the fall is slow. So the wrapper falls and an
       inner class shakes, and the two never have to agree. */
    wrap.classList.add("sinking");
    wrap.animate([
      {transform:`scale(${esc}) translateY(0)`,               opacity:1},
      {transform:`scale(${esc * 0.94}) translateY(${sr.height * 0.10}px)`, opacity:.9, offset:.35},
      {transform:`scale(${esc * 0.72}) translateY(${sr.height * 0.78}px)`, opacity:0}
    ], {duration: ms, easing:"cubic-bezier(.35,0,.75,1)", fill:"forwards"});
  }
  $("floorWrap").classList.remove("lit");
  await sleep(ms);
  if(wrap){ wrap.classList.remove("sinking"); wrap.style.opacity = "0"; }
  e.layers.length = 0; e.broken.length = 0;
}
