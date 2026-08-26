"use strict";
/* NEURO-METRO: AVUI — boot and input wiring
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */

renderMoment(); renderBuildStamp(); applyPersona(); buildPanel(); wirePanelGestures(); wireTips(); newPrompt(); applyOverload(S.player); buildEnemyLine(); render();
$("howtoBtn").addEventListener("click",()=>{ $("howto").classList.add("show"); sfx("tap"); });
$("howtoBack").addEventListener("click",()=>{ $("howto").classList.remove("show"); sfx("tap"); });
$("confrontBtn").addEventListener("click",()=>{
  /* This tap is the one gesture the platform gives us: audio unlock, fullscreen
     and the wake lock all have to be requested from inside it. */
  startMusic();
  goFullscreen();
  keepAwake();
  const t=$("title");
  t.classList.add("gone");
  setTimeout(()=>t.remove(),520);
  intro();
},{once:true});
