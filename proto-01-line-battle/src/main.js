"use strict";
/* NEURO-METRO: AVUI — boot and input wiring
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */

renderMoment(); renderBuildStamp(); applyPersona(); buildPanel(); wirePanelGestures(); wireTips(); newPrompt(); applyOverload(S.player); buildEnemyLine(); render();
$("howtoBtn").addEventListener("click",()=>{ $("howto").classList.add("show"); sfx("tap"); });
$("howtoBack").addEventListener("click",()=>{ $("howto").classList.remove("show"); sfx("tap"); });
/* THE TITLE SCREEN LEADS TO THE MAP NOW.
   The button used to walk straight into a fight because a fight was all there
   was. There is a city to be in, so this is the door into it — and the fight
   is something that happens to you out there, when you tap an enemy on a ride.

   The three platform calls stay exactly where they were: this tap is still the
   one gesture the platform gives us, and fullscreen and the wake lock survive
   the navigation. Audio does not, but the map unlocks its own on first touch.

   In handoff mode there is no title screen at all — handoff.js removes it —
   so there is nothing here to wire. */
if(!Handoff.on){
  $("confrontBtn").addEventListener("click",async ()=>{
    goFullscreen();
    keepAwake();
    /* WHO IS RIDING, asked once and only of someone who has never ridden. It
       goes here rather than after the transition because the transition is the
       act of going in, and there is no sense arriving in a city as nobody. */
    if(FirstRun.needed()) await FirstRun.show();
    const t=$("title");
    t.classList.add("leaving");
    /* `?enter=1` tells the map it is being arrived AT rather than reloaded, so
       it opens with the same circular wipe this app uses — out of the same
       black this fade is ending on. */
    setTimeout(()=>{ location.href="../MAP/index.html?enter=1"; },780);
  },{once:true});
}
