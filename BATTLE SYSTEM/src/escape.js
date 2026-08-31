"use strict";
/* NEURO-METRO: AVUI — running away
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   HOLD ANYWHERE ON THE ARENA AND A RING CLOSES AROUND YOUR FINGER. When it
   closes you are out of the fight, and it costs `fleeSegmentCost` Track
   Segments off the ride you were in the middle of.

   WHY A HOLD AND NOT A BUTTON. A button to leave is a button that is on the
   screen for the whole fight, saying every turn that leaving is one of the
   things you might do — which is exactly the wrong thing for an interface about
   staying with a feeling to keep suggesting. A hold is invisible until you go
   looking for it, takes three seconds of deciding, and can be abandoned by
   simply letting go. It is available and it is never offered.

   AND WHY IT COSTS SEGMENTS. Not stamina, and not crystals: Track Segments are
   what the ride is actually spending, so an escape is paid for in the units of
   the journey it interrupted. Someone who runs from everything never arrives.

   WHERE IT IS NOT AVAILABLE. Anywhere the fight is already doing something —
   mid-resolution, during a Line Manager's second wind, once it is over — and on
   the controls, which have their own gestures (a long press on an ability opens
   its tooltip, and the panel pages on a swipe). "The arena" means the part of
   the screen that is the fight rather than the part that is the interface.   */

const Escape = {
  el: null, timer: null, raf: 0, t0: 0, id: null,

  /* Controls own their own presses. Listed as the regions they belong to rather
     than as tag names, because what matters is "is this a thing you operate",
     and half of them are divs. */
  BLOCKED: ".abilpanel, .loadoutbar, .lane-wrap, .panel, .departslot, .actionrow," +
           " .tip, .tipveil, .results, .over, .title, .howto, .firstrun, .statusrow," +
           " button, input",

  allowed(ev){
    if(S.phase !== "BUILD" || S.busy) return false;
    if(S.enemy && S.enemy.phaseBusy) return false;
    if(document.querySelector(".results, .over")) return false;
    /* THE OPENING IS NOT THE FIGHT. `S.phase` is already BUILD while the intro
       is still playing — the state machine is simply waiting — so an impatient
       tap on the diagonal line would have opened an escape ring over a fight
       that had not started. `preintro` is the class the arena wears until the
       interface has been drawn into place. */
    const sc = $("screen");
    if(sc.classList.contains("preintro")) return false;
    const t = ev.target;
    return !(t && t.closest && t.closest(this.BLOCKED));
  },

  begin(ev){
    if(this.el || !this.allowed(ev)) return;
    this.id = ev.pointerId;
    const sr = $("screen").getBoundingClientRect();
    const ms = rv(RULES.fleeHoldMs, 3000);
    const R = 34, C = 2 * Math.PI * R;
    const el = document.createElement("div");
    el.className = "fleering";
    el.style.left = (ev.clientX - sr.left) + "px";
    el.style.top  = (ev.clientY - sr.top)  + "px";
    /* SVG rather than a conic gradient: a conic needs @property to animate at
       all, and this has to be a hard pixelly arc travelling round a circle
       rather than a soft sweep. `stroke-dasharray` is the same trick the ability
       cooldowns would use and it composites on its own. */
    el.innerHTML =
      '<svg viewBox="0 0 80 80" shape-rendering="geometricPrecision">' +
        '<circle class="ftrack" cx="40" cy="40" r="' + R + '"/>' +
        '<circle class="farc" cx="40" cy="40" r="' + R + '"' +
          ' stroke-dasharray="' + C.toFixed(1) + '"' +
          ' stroke-dashoffset="' + C.toFixed(1) + '"/>' +
      '</svg>' +
      '<b class="flabel">RUN</b>' +
      '<small class="fcost">&minus;' + rv(RULES.fleeSegmentCost, 5) + ' SEGMENTS</small>';
    $("screen").appendChild(el);
    this.el = el;
    this.t0 = performance.now();
    sfx("flee_hold");

    const arc = el.querySelector(".farc");
    const step = () => {
      if(!this.el) return;
      const k = Math.min(1, (performance.now() - this.t0) / ms);
      arc.setAttribute("stroke-dashoffset", (C * (1 - k)).toFixed(1));
      el.style.setProperty("--k", k.toFixed(3));
      if(k >= 1){ this.done(); return; }
      this.raf = requestAnimationFrame(step);
    };
    step();
    /* rAF is SUSPENDED on a hidden tab, and a ring that silently stops closing
       because the phone locked would leave a finger held on nothing. The timer
       is the one that actually decides. */
    this.timer = setTimeout(() => this.done(), ms + 40);
  },

  cancel(){
    if(!this.el) return;
    cancelAnimationFrame(this.raf); clearTimeout(this.timer);
    const el = this.el; this.el = null; this.id = null;
    el.classList.add("gone");
    setTimeout(() => el.remove(), 200);
  },

  done(){
    if(!this.el) return;
    cancelAnimationFrame(this.raf); clearTimeout(this.timer);
    const el = this.el; this.el = null; this.id = null;
    el.classList.add("fired");
    setTimeout(() => el.remove(), 320);
    /* CHECKED AGAIN AT THE MOMENT IT FIRES. Three seconds is long enough for the
       fight to have moved on underneath the finger — the enemy's line can start
       resolving while the ring is closing — and leaving mid-resolution would
       tear down a sequence that is still awaiting itself. */
    if(S.phase !== "BUILD" || S.busy){ sfx("resist"); return; }
    sfx("flee_go");
    $("screen").classList.add("fleeing");
    finish("flee");
  }
};

addEventListener("pointerdown", ev => Escape.begin(ev));
["pointerup", "pointercancel", "pointerleave"].forEach(t =>
  addEventListener(t, ev => { if(Escape.id === null || ev.pointerId === Escape.id) Escape.cancel(); }));
/* A finger that slides off what it started on is a finger that changed its mind
   about pressing, not one still pressing. Without this the ring kept closing
   while the player scrolled the ability panel with the same touch. */
addEventListener("pointermove", ev => {
  if(!Escape.el || ev.pointerId !== Escape.id) return;
  const sr = $("screen").getBoundingClientRect();
  const x = ev.clientX - sr.left, y = ev.clientY - sr.top;
  const cx = parseFloat(Escape.el.style.left), cy = parseFloat(Escape.el.style.top);
  if(Math.hypot(x - cx, y - cy) > 46) Escape.cancel();
});
