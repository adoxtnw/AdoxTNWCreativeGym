"use strict";
/* NEURO-METRO: AVUI — who you are, asked once
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   THE FIRST QUESTION THE GAME ASKS, and it asks it here rather than on the map
   because this is the door: a player who has just decided to go in should be
   asked who is going in, not shown a city and interrupted.

   IT HAPPENS ONCE. Not "once per session" and not "once until they clear their
   cookies" — once per SAVE. The check is for a map profile, so someone coming
   back out to the title screen from the pause menu and going in again is never
   asked twice.

   WHAT IT LEAVES BEHIND is deliberately tiny: a name and up to two affinities,
   under one key. It does NOT write a profile. The map owns what a profile is —
   its armor, its keys, its crystals, its schema version — and a second app
   writing that structure would be a second definition of it, out of date the
   first time the map's changed. Two fields is a message; a profile is a claim.

   THE PACE IS THE POINT. Every element arrives on its own, and the emotions
   take a full second each, rising as they fade in, one waiting for the last.
   Six seconds to meet six emotions is slow for a menu and about right for the
   only moment in the game that asks the player to decide what they are.      */

const HANDOFF_KEY = "nm.avui.newpassenger";
/* Must match SAVE_KEY in MAP/src/player.js. Read-only, and only ever to answer
   "has this person played before" — the one fact this side needs and cannot
   work out for itself. */
const MAP_SAVE_KEY = "nm.avui.map.v2";

const FirstRun = {
  chosen: [],
  name: "",

  /* A save means they have been here. No save means they have not. */
  needed(){
    if(Handoff.on) return false;                 /* inside a fight; not a door */
    try{
      if(localStorage.getItem(MAP_SAVE_KEY)) return false;
      if(localStorage.getItem(HANDOFF_KEY)) return false;   /* asked, not yet arrived */
    }catch(e){ /* storage denied: ask, and let the map cope */ }
    return true;
  },

  /* Resolves when PROCEED is tapped. The caller then runs the transition it
     was always going to run — this screen does not own the way out. */
  show(){
    return new Promise(resolve => {
      this.chosen = []; this.name = "";
      const el = document.createElement("div");
      el.className = "firstrun";
      el.innerHTML =
        '<div class="frgrid"></div>' +
        '<div class="frwrap">' +
          '<h2 class="frq">WHO IS RIDING?</h2>' +
          '<button class="frname pxr" id="frName">' +
            '<span class="frnamev">TAP TO NAME YOURSELF</span></button>' +
          '<input class="frinput" id="frInput" maxlength="14" spellcheck="false" ' +
            'autocomplete="off" placeholder="your name">' +
          '<p class="frsub">Choose what you carry. One is enough. Two is heavier.</p>' +
          '<div class="fremos">' + EMO_ORDER.map(id => this.card(id)).join("") + '</div>' +
          '<button class="frgo pxr" id="frGo" disabled>PROCEED</button>' +
        '</div>';
      $("screen").appendChild(el);
      this.el = el;
      this.wire(resolve);
      this.arrive();
    });
  },

  card(id){
    const e = EMOTIONS[id];
    return '<button class="fremo pxr" data-e="' + id + '" style="--emo:' + e.hex + '">' +
      '<span class="fretxt">' +
        '<b class="frename">' + esc(e.name.toUpperCase()) + '</b>' +
        '<small class="fredesc">' + esc(e.description || "") + '</small>' +
      '</span>' +
      '<i class="fresym"><svg viewBox="0 0 9 9" shape-rendering="crispEdges">' +
        iconSVG(e.icon) + '</svg></i>' +
    '</button>';
  },

  wire(resolve){
    const el = this.el;
    const input = el.querySelector("#frInput");
    const nameBtn = el.querySelector("#frName");
    const label = el.querySelector(".frnamev");
    const go = el.querySelector("#frGo");

    /* The field only exists once it is asked for — an empty text box sitting
       on the screen is a form, and this is meant to read as a question. */
    nameBtn.addEventListener("click", () => {
      sfx("tap");
      el.classList.add("naming");
      input.focus();
      input.select();
    });
    const takeName = () => {
      /* FOLDED TO WHAT THE MAP CAN DRAW. The marker is a 3x5 bitmap font with
         no lower case and no accents, so a name it cannot render would appear
         beside the player as gaps. Corrected at entry, where it can still be
         seen, rather than silently later. */
      this.name = String(input.value || "").toUpperCase()
        .replace(/[^A-Z0-9 .\-']/g, "").trim().slice(0, 14);
      input.value = this.name;
      label.textContent = this.name || "TAP TO NAME YOURSELF";
      el.classList.toggle("named", !!this.name);
      el.classList.remove("naming");
    };
    input.addEventListener("blur", takeName);
    input.addEventListener("keydown", ev => { if(ev.key === "Enter") input.blur(); });

    el.querySelectorAll(".fremo").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.dataset.e, i = this.chosen.indexOf(id);
        if(i >= 0){ this.chosen.splice(i, 1); b.classList.remove("on"); sfx("resist"); }
        else{
          /* TWO IS THE CEILING, and the third tap is not silently ignored: the
             oldest choice is released so the tap always does something. A
             control that does nothing reads as broken. */
          if(this.chosen.length >= 2){
            const drop = this.chosen.shift();
            const old = el.querySelector('.fremo[data-e="' + drop + '"]');
            if(old) old.classList.remove("on");
          }
          this.chosen.push(id); b.classList.add("on"); sfx("place");
        }
        go.disabled = this.chosen.length === 0;
        el.classList.toggle("ready", this.chosen.length > 0);
      });
    });

    go.addEventListener("click", () => {
      if(this.chosen.length === 0) return;
      takeName();                                /* in case the field is open */
      sfx("clash");
      this.keep();
      this.leave().then(resolve);
    }, {once: true});
  },

  /* Two fields, one key. See the note at the top of this file. */
  keep(){
    const blob = {name: this.name || "PASSENGER", affinities: this.chosen.slice()};
    try{ localStorage.setItem(HANDOFF_KEY, JSON.stringify(blob)); }catch(e){}
  },

  /* ---- ONE AT A TIME, IN, AND ONE AT A TIME, OUT --------------------------
     `arrive` waits on each element before starting the next, so the sequence
     is a queue rather than six overlapping delays — which is what lets the
     emotions take a whole second each without the rest of the screen having to
     know about it. */
  async arrive(){
    const el = this.el, q = s => el.querySelector(s);
    await sleep(120);
    await this.rise(q(".frgrid"), 700);
    await this.rise(q(".frq"), 520);
    await this.rise(q(".frname"), 420);
    await this.rise(q(".frsub"), 420);
    const cards = [].slice.call(el.querySelectorAll(".fremo"));
    for(let i = 0; i < cards.length; i++){
      /* A FULL SECOND EACH, and the next does not begin until this one has
         landed. Six emotions introduced over six seconds is slow for an
         interface and correct for this one. */
      sfxAt(SOUNDS.speak, 0.5 + i * 0.06);
      await this.rise(cards[i], 1000);
    }
    await this.rise(q(".frgo"), 520);
  },
  rise(node, ms){
    if(!node) return Promise.resolve();
    node.style.setProperty("--fr", ms + "ms");
    node.classList.add("in");
    return sleep(ms);
  },
  /* Out the same way it came, in the same order, so leaving is recognisably
     the reverse of arriving rather than the screen simply being taken away. */
  async leave(){
    const el = this.el;
    const order = [].slice.call(el.querySelectorAll(".fremo")).reverse()
      .concat([el.querySelector(".frgo"), el.querySelector(".frsub"),
               el.querySelector(".frname"), el.querySelector(".frq")]);
    for(let i = 0; i < order.length; i++){
      if(!order[i]) continue;
      order[i].classList.remove("in");
      order[i].classList.add("out");
      await sleep(70);
    }
    await sleep(180);
    el.classList.add("gone");
    await sleep(280);
    el.remove();
  }
};

/* Sheet order IS the order they are met — the same order the lines are
   numbered in and the same order the charge ramp runs through. */
const EMO_ORDER = Object.keys(EMOTIONS);
