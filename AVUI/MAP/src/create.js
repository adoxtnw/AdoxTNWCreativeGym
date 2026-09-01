"use strict";
/* NEURO-METRO: AVUI — MAP — becoming someone
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   Shown on first boot, when `Player.needsCreation()` is true. DOM, like the
   menu — this is text to read and fields to fill, not world to render.

   THREE THINGS HAPPEN HERE, and the third is the one that matters:

     1. a name, folded as it is typed to what the map can actually draw
     2. up to two Emotional Affinities, coloured from the emotions sheet
     3. THE SAVE FILE IS OFFERED IMMEDIATELY

   The third is not housekeeping. On a static host there is no account and no
   server; on iOS the browser deletes local storage after a week idle. The
   downloaded file IS the save. Asking for it later, once someone is attached to
   their progress, is asking too late — so it is put in front of them at the
   moment they have something to lose, with a sentence saying why.

   And the first screen carries a way OUT of creation: someone returning to a
   wiped phone must never be made to build a second character to get at the
   first one.                                                                 */

const Create = {
  open: false,
  step: "START",        /* START | NAME | DONE | RESTORE */
  name: "",
  picks: [],
  note: "",

  needed(){ return Player.needsCreation(); },
  show(step){ this.open = true; this.step = step || "START"; this.note = ""; this.render(); },
  hide(){ this.open = false; this.note = ""; this.render(); dirty = true; },

  render(){
    const el = $("create"); if(!el) return;
    el.classList.toggle("show", this.open);
    if(!this.open){ el.innerHTML = ""; return; }
    /* An explicit map, not `this[step.toLowerCase()]` — the NAME step would
       resolve to the `name` FIELD, which is a string, and calling it throws. */
    const screen = {START: this.start, NAME: this.nameScreen,
                    DONE: this.done, RESTORE: this.restore}[this.step] || this.start;
    el.innerHTML = '<div class="cbox">' + screen.call(this) +
      (this.note ? '<p class="cnote">' + esc(this.note) + '</p>' : '') + '</div>';
    this.bind();
  },

  /* ---- 1. the fork: new, or returning ---- */
  start(){
    return '<h1>NEURO&#8209;METRO</h1>' +
      '<p class="lead">Barcelona, today. Everyone on this network is carrying ' +
      'something.</p>' +
      '<button class="cbtn go" id="cNew">NEW PASSENGER</button>' +
      '<button class="cbtn" id="cHave">I HAVE A SAVE</button>';
  },

  /* ---- 2. name and affinities, on one screen ---- */
  nameScreen(){
    const n = RULES.affinitySlots || 2;
    const chips = Object.keys(EMOTIONS).map(e => {
      const on = this.picks.indexOf(e) >= 0;
      return '<button class="aff hudbtn' + (on ? ' on' : '') + '" data-aff="' + e + '"' +
        ' style="' + (on ? 'background:' + EMOTIONS[e].hex + ';color:#0c0a16' : '') + '">' +
        esc(EMOTIONS[e].name) + '</button>';
    }).join("");
    return '<h2>WHO ARE YOU?</h2>' +
      '<label class="clab">NAME</label>' +
      '<input class="cin" id="cName" maxlength="12" autocomplete="off" ' +
        'autocapitalize="characters" spellcheck="false" value="' + esc(this.name) + '">' +
      '<p class="chint">Letters and numbers. It rides above your marker on the map.</p>' +
      '<label class="clab">AFFINITIES &mdash; pick up to ' + n + '</label>' +
      '<div class="affs">' + chips + '</div>' +
      '<p class="chint">They colour your name and your marker. What they DO is still ' +
        'being designed.</p>' +
      '<button class="cbtn go" id="cGo">BOARD</button>' +
      '<button class="cbtn thin" id="cBack">back</button>';
  },

  /* ---- 3. the code, and the file ---- */
  done(){
    return '<h2>WELCOME, ' + esc(Player.name) + '</h2>' +
      '<label class="clab">YOUR PASSENGER CODE</label>' +
      '<p class="code">' + esc(Player.code) + '</p>' +
      '<p class="chint">It names your save. It is not a password &mdash; never use one ' +
        'here.</p>' +
      '<div class="warn2">' +
        '<b>Keep the file.</b> This game has no server. Your progress lives in this ' +
        'browser, and phones delete that after about a week of not playing. ' +
        'The file below is how you get it back &mdash; on any device.' +
      '</div>' +
      '<button class="cbtn go" id="cSave">DOWNLOAD MY SAVE</button>' +
      '<button class="cbtn" id="cEnter">ENTER THE NETWORK</button>';
  },

  /* ---- the way back in ---- */
  restore(){
    return '<h2>LOAD A SAVE</h2>' +
      '<button class="cbtn go" id="cPick">CHOOSE A SAVE FILE</button>' +
      '<p class="chint">The .json you downloaded before.</p>' +
      '<label class="clab">OR PASTE A SAVE CODE</label>' +
      '<textarea class="cin tall" id="cCode" spellcheck="false" ' +
        'placeholder="NMAVUI1:..."></textarea>' +
      '<button class="cbtn" id="cLoad">LOAD CODE</button>' +
      '<button class="cbtn thin" id="cBack2">back</button>';
  },

  bind(){
    const on = (id, fn) => { const e = $(id); if(e) e.addEventListener("click", fn); };
    on("cNew",  () => this.show("NAME"));
    on("cHave", () => this.show("RESTORE"));
    on("cBack", () => this.show("START"));
    on("cBack2",() => this.show("START"));

    const nm = $("cName");
    if(nm){
      /* folded as it is typed, so nobody discovers on the map that half their
         name is missing */
      nm.addEventListener("input", () => {
        const clean = sanitiseName(nm.value);
        if(nm.value !== clean) nm.value = clean;
        this.name = clean;
      });
      setTimeout(() => nm.focus(), 30);
    }
    const el = $("create");
    el.querySelectorAll("[data-aff]").forEach(b => b.addEventListener("click", () => {
      const e = b.dataset.aff, at = this.picks.indexOf(e);
      if(at >= 0) this.picks.splice(at, 1);
      else if(this.picks.length < (RULES.affinitySlots || 2)) this.picks.push(e);
      else { this.picks.shift(); this.picks.push(e); }   /* oldest gives way */
      this.render();
    }));

    on("cGo", () => {
      if(!this.name){ this.note = "Your name cannot be empty."; return this.render(); }
      if(!this.picks.length){ this.note = "Pick at least one affinity."; return this.render(); }
      Player.create(this.name, this.picks);
      this.show("DONE");
    });
    on("cSave", () => {
      const r = Vault.exportFile();
      this.note = r.ok ? "Saved as " + r.name : r.why;
      this.render();
    });
    on("cEnter", () => { this.hide(); enterNetwork(); });

    on("cPick", () => $("saveFile").click());
    on("cLoad", () => {
      const r = Vault.importCode(($("cCode") || {}).value);
      if(!r.ok){ this.note = r.why; return this.render(); }
      this.hide(); enterNetwork(r.interrupted);
    });
  }
};
