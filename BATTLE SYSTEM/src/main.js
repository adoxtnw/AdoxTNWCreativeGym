"use strict";
/* NEURO-METRO: AVUI — boot and input wiring
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */

/* ---- ?enemy=<units row id> — A LOOK, NOT A FIGHT ---------------------------
   The title screen's button goes to the MAP; a fight only ever starts by tapping
   something on a ride. That leaves no way at all to look at a new enemy — its
   silhouette, its colour, the persona it speaks as — without riding until one
   turns up, which is a slow way to check a shape.

   So this loads the sprite, the backdrop and the persona for any units row and
   stops there. It is a viewer. Nothing about the fight changes, and without the
   parameter this whole block does not run. An id the sheet does not have is
   ignored rather than being an error — a mistyped debug URL should show you the
   ordinary game, not a blank screen. */
let ENEMY_PREVIEW = null;
(function(){
  const want=/(?:\?|&)enemy=([^&]+)/.exec(location.search);
  if(!want || Handoff.on) return;
  const id=decodeURIComponent(want[1]);
  if(!UNITS[id]){ console.warn("?enemy="+id+" — no such units row; showing the default."); return; }
  S.enemy=makeUnit(id); refreshEnemyShape();
  /* THE TITLE SCREEN IS HIDDEN, NOT REMOVED — and that distinction cost two
     attempts. `handoff.js` removes it, so this copied that, and `#title` turns
     out to be where a lot of other things live: `#confrontBtn` and `#howtoBtn`
     are inside it, so main.js threw on the very next line and STOPPED HALFWAY
     THROUGH, silently, with every statement below it never running. The opening
     sequence's own canvases (`#introTrack`, `#introCv`, `#introWipe`) are in
     there too, so `intro()` reached into null as well.

     `display:none` takes it off the screen and out of the tab order and leaves
     every one of those where the rest of the file expects to find it. */
  const t=$("title"); if(t) t.style.display="none";
  ENEMY_PREVIEW = id;
  console.info("?enemy="+id+" — "+S.enemy.name+" ("+S.enemy.tier+" "+S.enemy.emotion+"). "
             + "Title screen removed: this is a viewer, not a way in.");
})();

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
   so there is nothing here to wire. The ?enemy= viewer only hides it, so its
   button still exists; wiring a button nobody can see costs nothing, and the
   alternative was removing the element and taking half this file down with it. */
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
    /* the probe resolved at load; awaiting it is a formality unless the network
       was slow, and it is the difference between navigating to the folder that
       EXISTS and the one this disk happens to call it */
    await mapURLReady;
    setTimeout(()=>{ location.href = mapURL("index.html", "?enter=1"); },780);
  },{once:true});
}

/* The arena starts on `.preintro` with everything at zero opacity, and the
   OPENING SEQUENCE is what lifts it. The viewer runs the real one — it is the
   way the game introduces an enemy, and a viewer that revealed it some other
   way would be showing you something the game never shows. */
if(ENEMY_PREVIEW) intro();
