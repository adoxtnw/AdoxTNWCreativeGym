"use strict";
/* NEURO-METRO: AVUI — MAP — the panels around the world
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   Everything here is DOM. The canvas draws the world; text the player has to
   read — numbers, choices, warnings — is markup, the same split the battle
   system uses.

   THE STATS STRIP IS NOT DECORATION. Combat GDD 13.1.3 requires that the map
   show when the player is Overflowing, because MS and EC persist and someone
   who won their last fight at 20 MS with 90 EC needs to see that before
   choosing to ride on rather than discovering it in the next encounter.     */

/* THE PLAYER'S STATE IS DRAWN ON THE MAP, not in a strip of DOM — see
   drawPlayer() in journey.js. It rides the marker because that is where the
   progression GDD puts the name ("above their location indicator"), and because
   combat GDD 13.1.3 requires Overflow to be visible on the map: if it lived in
   the pause menu you would have to go looking for the one thing that should
   stop you boarding. */

/* The progress header from the GDD's mock: where this leg is going, and how
   much of it is bridged. */
let _headKey = "";
function renderRouteHead(){
  const el = $("routeHead"); if(!el) return;
  const show = Run.active && (J.phase === "RIDING" || J.phase === "ANNOUNCE" ||
                              J.phase === "ENCOUNTER");
  el.classList.toggle("show", show);
  if(!show){ _headKey = ""; return; }
  const leg = Run.current(); if(!leg) return;
  /* The segment count changes as you collect, so this has to be driven by the
     clock rather than by phase changes — but rewriting the markup twelve times
     a second for a number that rarely moves is wasteful, so it only redraws
     when something it displays has actually changed. */
  const key = leg.from + ">" + leg.to + "|" + Trip.collected + "/" + Trip.target +
              "|" + Run.leg + "/" + Run.legs.length;
  if(key === _headKey) return;
  _headKey = key;
  el.innerHTML =
    '<span class="rl" style="background:' + EMOTIONS[leg.line.emotion].hex + '">' +
      leg.line.id + '</span>' +
    esc(STATIONS[leg.from].name) + ' <b>&rarr;</b> ' + esc(STATIONS[leg.to].name) +
    '<span class="seg">' + Trip.collected + '/' + Trip.target + '</span>' +
    '<span class="legs">leg ' + (Run.leg + 1) + '/' + Run.legs.length + '</span>';
}

/* The Traveler's Dilemma. The numbers come from the rules, not from the copy,
   so the panel cannot drift out of step with what the buttons actually do. */
function renderDilemma(){
  const el = $("dilemma"); if(!el) return;
  const leg = Run.current(); if(!leg) return;
  const keep = Math.round((RULES.exitKeepPct != null ? RULES.exitKeepPct : 0.6) * 100);
  const held = Run.vaultCrystals(), items = Run.vault.items.length;
  el.innerHTML =
    '<h3>PROPERA PARADA: ' + esc(STATIONS[leg.to].name) + '</h3>' +
    '<p class="held">Unbanked: ' + held + ' crystals' +
      (items ? ' &middot; ' + items + ' item' + (items === 1 ? '' : 's') : '') + '</p>' +
    '<div class="drow">' +
      '<button class="dbtn hudbtn" id="dExit">EXIT HERE' +
        '<small>Keep ' + keep + '% &middot; safe checkpoint</small></button>' +
      '<button class="dbtn go hudbtn" id="dGo">CONTINUE' +
        '<small>Keep 100% &middot; no healing</small></button>' +
    '</div>';
  $("dExit").addEventListener("click", chooseExit);
  $("dGo").addEventListener("click", chooseContinue);
}

/* The debug stand-in for a battle. Deliberately plain — it must never be
   mistaken for the battle system. */
function syncEncounterHud(){
  const el = $("encounter"); if(!el) return;
  el.classList.toggle("show", Encounter.open);
  if(!Encounter.open) return;
  const boss = Encounter.kind === "BOSS";
  el.innerHTML =
    '<div class="ebox">' +
      '<h2>BATTLE OCCURRED</h2>' +
      '<p class="ekind">' + (boss ? "STATION BOSS" : "TRACK ENCOUNTER") + ' &middot; ' +
        esc(Encounter.enemy.id) + '</p>' +
      '<p class="emods">' + Encounter.descriptor.modifiers.join(" &middot; ") + '</p>' +
      '<p class="estate">' + Math.round(Player.ms) + ' MS &middot; ' +
        Math.round(Player.ec) + ' EC' +
        (Encounter.descriptor.canFlee ? '' : ' &middot; no escape') + '</p>' +
      '<div class="erow">' +
        '<button class="ebtn win hudbtn"  id="eWin">WIN</button>' +
        '<button class="ebtn loss hudbtn" id="eLoss">LOSS</button>' +
        (Encounter.descriptor.canFlee ?
          '<button class="ebtn hudbtn" id="eFled">FLED</button>' : '') +
      '</div>' +
      '<p class="edebug">debug &middot; the battle system is not wired up yet</p>' +
    '</div>';
  $("eWin").addEventListener("click", () => Encounter.choose("WIN"));
  $("eLoss").addEventListener("click", () => Encounter.choose("LOSS"));
  const f = $("eFled"); if(f) f.addEventListener("click", () => Encounter.choose("FLED"));
}

/* =============================== BAGGAGE =================================
   What this ride has actually got you, mid-ride. The Emotional Trip bar is on
   screen the whole time but it only answers "how far", and the purse is not on
   screen at all — so without this the player is collecting into a void and has
   to guess whether the last twenty seconds were worth anything.

   It is the VAULT, not the bank: everything here is still unbanked and still
   losable, which is the whole tension of the Dilemma. The panel says so.     */
const Baggage = {
  open: false,
  toggle(){ this.open = !this.open; this.render(); syncHud(); dirty = true; },
  hide(){ if(!this.open) return; this.open = false; this.render(); syncHud(); dirty = true; },

  render(){
    const el = $("baggage"); if(!el) return;
    el.classList.toggle("show", this.open);
    if(!this.open){ el.innerHTML = ""; return; }

    const v = Run.vault;
    const need = Trip.target || 1, got = Math.min(Trip.collected, need);
    const pct = Math.round((got / need) * 100);

    /* one counter per emotion, down the side */
    const cry = Object.keys(EMOTIONS).map((e, i) =>
      '<div class="bcry"><span class="dot" style="background:' + EMOTIONS[e].hex +
      ';--fd:' + (i * 0.27).toFixed(2) + 's"></span><b>' + (v.crystals[e] || 0) + '</b>' +
      '<small>' + esc(EMOTIONS[e].short || EMOTIONS[e].name) + '</small></div>').join("");

    /* the grid: one cell per thing carried, stacked by id */
    const count = {};
    v.items.forEach(i => { count[i] = (count[i] || 0) + 1; });
    const ids = Object.keys(count);
    const cells = ids.map(i => {
      const it = ITEMS[i];
      const col = it && EMOTIONS[it.emotion] ? EMOTIONS[it.emotion].hex : "#5c5348";
      const fd = ((i.length * 7) % 20) / 10;
      return '<div class="bcell pxr" style="--emo:' + col + '">' +
        '<i class="sym" style="--fd:' + fd + 's;color:' + col + '">' + glyphSVG("BAG") + '</i>' +
        '<span class="bname">' + esc(it ? it.name : i) + '</span>' +
        (count[i] > 1 ? '<b class="bx">&times;' + count[i] + '</b>' : '') + '</div>';
    }).join("");
    /* empty cells so the grid keeps its shape and reads as a container */
    let pad = "";
    for(let i = ids.length; i < Math.max(9, Math.ceil((ids.length + 1) / 3) * 3); i++)
      pad += '<div class="bcell empty pxr"></div>';

    el.innerHTML =
      '<div class="bhead"><b>BAGGAGE</b>' +
        '<span class="bhint">unbanked &mdash; still losable</span>' +
        '<button class="mclose pxr hudbtn" id="bgClose">&times;</button></div>' +
      '<div class="bwrap">' +
        '<div class="bgrid">' + cells + pad + '</div>' +
        '<div class="bside">' +
          '<div class="bseg"><small>EMOTIONAL TRIP</small>' +
            '<div class="bbar"><i style="height:' + pct + '%"></i></div>' +
            '<b>' + got + '/' + need + '</b></div>' +
          '<div class="bcrys">' + cry + '</div>' +
        '</div>' +
      '</div>';
    $("bgClose").addEventListener("click", () => Baggage.hide());
  }
};
