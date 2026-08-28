"use strict";
/* NEURO-METRO: AVUI — MAP — the panels around the world
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   Everything here is DOM. The canvas draws the world; text the player has to
   read — numbers, choices, warnings — is markup, the same split the battle
   system uses.

   THE STATS STRIP IS NOT DECORATION. MS and EC persist between fights, so
   someone who won their last one at 20 MS needs to see that before choosing to
   ride on rather than discovering it in the next encounter.                 */

/* THE PLAYER'S STATE IS DRAWN ON THE MAP, not in a strip of DOM — see
   drawPlayer() in journey.js. It rides the marker because that is where the
   progression GDD puts the name ("above their location indicator"), and because
   a state that can stop you boarding should never need a panel opening to
   find. */

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
    '<h3><i class="sym">' + glyphSVG("WARN") + '</i>PROPERA PARADA: ' +
      esc(STATIONS[leg.to].name) + '</h3>' +
    '<p class="held"><i class="sym">' + glyphSVG("DISC") + '</i>Unbanked <b>' + held +
      '</b> crystals' +
      (items ? ' &middot; ' + items + ' item' + (items === 1 ? '' : 's') : '') + '</p>' +
    '<div class="drow">' +
      '<button class="bigbtn pxr hudbtn" id="dExit">EXIT HERE' +
        '<small>Keep ' + keep + '% &middot; safe checkpoint</small></button>' +
      '<button class="bigbtn go pxr hudbtn" id="dGo">CONTINUE' +
        '<small>Keep 100% &middot; no healing</small></button>' +
    '</div>';
  $("dExit").addEventListener("click", chooseExit);
  $("dGo").addEventListener("click", chooseContinue);
}

/* The debug stand-in for a battle is GONE. It existed so map flow could be
   built and tested with no battle system to hand off to, and there is one now —
   keeping it meant a second, drifting definition of what an encounter result
   is, and it was leaking on screen over real fights because `Encounter.open` is
   true for both. `?debugbattle=1` went with it. */

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
      '<div class="bcry pxr" style="--emo:' + EMOTIONS[e].hex + '">' +
      '<span class="dot" style="background:' + EMOTIONS[e].hex +
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
      '<div class="bhead"><i class="sym">' + glyphSVG("BAG") + '</i><b>BAGGAGE</b>' +
        '<span class="bhint">unbanked &mdash; still losable</span>' +
        '<button class="mclose pxr hudbtn" id="bgClose">&times;</button></div>' +
      '<div class="bwrap">' +
        '<div class="bgrid">' + cells + pad + '</div>' +
        '<div class="bside">' +
          '<div class="bseg pxr"><small>EMOTIONAL TRIP</small>' +
            '<div class="bbar"><i style="height:' + pct + '%"></i></div>' +
            '<b>' + got + '/' + need + '</b></div>' +
          '<div class="bcrys">' + cry + '</div>' +
        '</div>' +
      '</div>';
    $("bgClose").addEventListener("click", () => Baggage.hide());
  }
};

/* ---------------------------------------------------------------------------
   THE CITY BAR — where you are in the world, rather than on the network.

   The marker says which station you are standing at. This says which city,
   which day, what hour and what the sky is doing, because every one of those
   already drives the numbers (`world_bands`) and none of them was visible
   anywhere. A player who cannot see that it is a stormy Friday evening cannot
   understand why the track is suddenly thick with enemies.

   The status tags are the same idea taken one step further: they are the only
   part of the world state that is not ambient, so they get the treatment an
   ability gets — tap one and it tells you what it is doing to you.
   -------------------------------------------------------------------------- */
const CityBar = {
  _key: "",
  render(){
    const el = $("cityBar"); if(!el) return;
    /* Only on the map. During a ride the route header owns the top of the
       screen, and two headers stacked is a HUD arguing with itself. */
    const show = !busy() && !Menu.open;
    el.classList.toggle("show", show);
    if(!show){ el.innerHTML = ""; this._key = ""; return; }

    const n = WorldState.now(), w = WorldState.weather();
    const tags = CityStatus.active();
    /* Rebuilt only when something actually changed — this runs on every HUD
       sync, and replacing the markup every time would restart the wobble on
       every tag several times a second. */
    const key = n.day + n.hour + w + tags.map(t => t.id).join();
    if(key === this._key) return;
    this._key = key;

    const box = (cls, txt) => '<span class="citybox pxr ' + cls + '">' + txt + '</span>';
    const hh = String(n.hour).padStart(2, "0") + ":00";
    let html = box("city", "BARCELONA") + box("", DAY_LONG[n.day] || n.day) +
               box("", hh) + box("wx", WX_LABEL[w] || w);
    tags.forEach(t => {
      const cols = CityStatus.colours(t);
      const a = cols[0] ? rgbHex(cols[0]) : "#c9c3b0";
      const b = cols[1] ? rgbHex(cols[1]) : a;
      html += '<button class="citybox ctag pxr hudbtn" data-status="' + esc(t.id) +
        '" style="--c1:' + a + ';--c2:' + b + '">' + esc(t.name.toUpperCase()) + '</button>';
    });
    el.innerHTML = html;

    el.querySelectorAll(".ctag").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = CITY_STATUS.filter(r => r.id === btn.dataset.status)[0];
        if(row) showTip(statusTipHTML(row), btn, rgbHex(CityStatus.colours(row)[0] || [201,195,176]));
      });
    });
  }
};
const DAY_LONG = {SUN:"SUNDAY", MON:"MONDAY", TUE:"TUESDAY", WED:"WEDNESDAY",
                  THU:"THURSDAY", FRI:"FRIDAY", SAT:"SATURDAY"};
const WX_LABEL = {CLEAR:"CLEAR", CLOUD:"CLOUDED", RAIN:"RAIN", STORM:"STORM"};
const rgbHex = c => "#" + [0,1,2].map(i =>
  Math.max(0, Math.min(255, Math.round(c[i]))).toString(16).padStart(2, "0")).join("");

/* WHAT THE TAG SAYS WHEN TAPPED. The blurb comes from the sheet, and under it
   the actual multipliers — the same split the battle system uses, where the
   sentence tells you what it IS and the chips tell you what it DOES. Naming the
   status again would be noise: the bubble is pointing at its own tag. */
function statusTipHTML(row){
  const stats = [];
  const chip = (k, label) => {
    const v = num(row[k], 1);
    if(v === 1) return;
    stats.push('<span class="tstat pxr">' + label + ' &times;' + v + '</span>');
  };
  chip("density", "ENEMIES"); chip("aggro", "AGGRESSION");
  chip("fog", "FOG"); chip("diltransience", "DISTANCE");
  const where = Object.keys(CityStatus.affected(row)).length;
  return '<div class="tipbody">' + esc(row.blurb || "") + '</div>' +
    (stats.length ? '<div class="tipstats">' + stats.join("") + '</div>' : "") +
    '<div class="tipwhere">' + where + ' STATION' + (where === 1 ? '' : 'S') +
    ' &middot; ' + esc(listOf(row.lines).join(" ")) + '</div>';
}

/* ---- the bubble, lifted from the battle system ---------------------------
   RE-DECLARED, NOT IMPORTED, like every other helper here — the two apps are
   siblings. Same placement rule: put it against the anchor, then shove it back
   inside the screen, and let the tail keep pointing at the anchor rather than
   at the middle of the bubble it has been shoved away from. */
function showTip(html, anchorEl, accent){
  const tip = $("tip"), veil = $("tipVeil");
  if(!tip || !veil) return;
  tip.innerHTML = html;
  tip.style.setProperty("--tipc", accent || "#c9c3b0");
  tip.classList.add("on"); veil.classList.add("on");
  const sr = $("screen").getBoundingClientRect(), ar = anchorEl.getBoundingClientRect();
  tip.style.left = "0px"; tip.style.top = "0px";
  const tr = tip.getBoundingClientRect();
  const anchorX = (ar.left - sr.left) + ar.width / 2;
  let x = anchorX - tr.width / 2;
  let y = (ar.top - sr.top) - tr.height - 14;
  const below = y < 6;
  if(below) y = (ar.bottom - sr.top) + 14;
  x = Math.max(6, Math.min(x, sr.width - tr.width - 6));
  y = Math.max(6, Math.min(y, sr.height - tr.height - 6));
  tip.style.left = Math.round(x) + "px";
  tip.style.top  = Math.round(y) + "px";
  tip.classList.toggle("below", below);
  tip.style.setProperty("--tail",
    Math.round(Math.max(14, Math.min(anchorX - x, tr.width - 14))) + "px");
}
function hideTip(){
  const t = $("tip"), v = $("tipVeil");
  if(t) t.classList.remove("on");
  if(v) v.classList.remove("on");
}

/* THE MENU BUTTON WEARS THE PLAYER'S NAME. "MENU" describes the mechanism; the
   name describes what is behind it, which is the whole of who they are in this
   city. "Emotional Baggage" under it is what the pause menu actually holds —
   the crystals, the armor, the sets, the run — and it is the phrase the design
   uses for that, so the button says it rather than inventing a synonym. */
function renderMenuBtn(){
  const b = $("menuBtn"); if(!b) return;
  const name = (Player.name || "PASSENGER").toUpperCase();
  const html = '<span class="mface pxr"><b>' + esc(name) +
    '</b><small>Emotional Baggage</small></span>';
  if(b.innerHTML !== html) b.innerHTML = html;
}

/* ---- WHAT AN ABILITY DOES, ported from the battle system -------------------
   Same three pieces, unchanged: the keyword colours, the `{KEYWORD}` / *emphasis*
   markup its blurbs are written in, and the stat chips. Written once in the
   sheet, so a blurb edited for a fight reads correctly in the pause menu on the
   next rebuild without anyone remembering to update a second copy.

   `{EC}` deliberately has no colour of its own — it takes the scrolling ramp,
   because Emotional Charge is not one emotion. */
const KW_COLOR = {
  MS: "#b0ffe1", EC: null, LAYER: "#f4efe4", LAYERS: "#f4efe4",
  OVERLOAD: "#e53859",
  ANGER: "#e53859", SURPRISE: "#724082", DISGUST: "#56a36a",
  JOY: "#fcc336",   SADNESS: "#3d66c1",   FEAR: "#929fa5"
};
function tipMarkup(text){
  return esc(text || "")
    .replace(/\{([A-Z_]+)\}/g, (_, k) => {
      const c = KW_COLOR[k];
      if(c === null) return '<b class="kw rain">' + k + '</b>';
      return '<b class="kw" style="color:' + (c || "var(--ink)") + '">' + k + '</b>';
    })
    .replace(/\*(.+?)\*/g, '<b class="em">$1</b>');
}
/* The numbers that do not fit in the box. Same chips as the value tags. */
function abilityStats(a){
  const out = [];
  if(num(a.cost, 0) > 0) out.push('<span class="tstat ec pxr">-' + a.cost + ' EC</span>');
  if(a.kind === "DAMAGE") out.push('<span class="tstat pxr">' + a.power + ' DMG</span>');
  else if(a.kind === "CHARGE"){
    out.push('<span class="tstat ec pxr">+' + a.power + ' EC</span>');
    if(num(a.self_ms, 0)) out.push('<span class="tstat pxr">-' + a.self_ms + ' MS</span>');
  }
  else if(a.kind === "SHIELD") out.push('<span class="tstat pxr">BLOCK ' + a.power + '</span>');
  if(num(a.charge, 0)) out.push('<span class="tstat pxr">' + a.charge + ' CHARGE</span>');
  return out.length ? '<div class="tipstats">' + out.join("") + '</div>' : "";
}
/* No title: the bubble is pointing at the ability, so naming it again is noise. */
function abilityTip(a){
  return '<div class="tipbody">' + tipMarkup(a.blurb) + '</div>' + abilityStats(a);
}

/* ---- THE CARD'S BAR ---------------------------------------------------------
   The battle system's gauge, drawn into the pause menu. It repaints on the
   game clock while the menu is open so its waves move; the moment the menu
   closes it stops, because a canvas being repainted behind a hidden panel is
   pure waste. */
const MenuGauge = {
  ctx: null, dctx: null,
  /* Called after every menu render — the canvases are new elements each time,
     so the contexts cannot be cached across renders. */
  attach(){
    const live = $("mGauge"), dead = $("mGaugeDead");
    if(!live || !dead){ this.ctx = null; return; }
    live.width = dead.width = RULES.gaugeW;
    live.height = dead.height = RULES.gaugeH;
    this.ctx = live.getContext("2d");
    this.dctx = dead.getContext("2d");
    this.draw();
  },
  draw(){
    if(!this.ctx) return;
    const u = Player.gaugeUnit();
    drawGauge(this.ctx, this.dctx, u, {accent: GAUGE.mint});
    const ms = $("mTagMs"), ec = $("mTagEc");
    if(ms) ms.textContent = u.shownMs + " MS";
    if(ec){
      ec.textContent = u.shownEc + " EC";
      ec.classList.toggle("overcharged", u.shownEc > u.shownMs);
    }
  },
  step(){
    if(!this.ctx || !Menu.open) return;
    gaugePhase++;
    this.draw();
  }
};

/* ---- EVERYTHING ARRIVES FROM BELOW, ONE AFTER THE OTHER --------------------
   The delay is set per element as a custom property rather than by a stack of
   nth-child rules, because the menu's contents are different on every tab and
   nobody can write a rule for "the seventh thing, whatever it is".

   Capped, and deliberately: past about a dozen items a stagger stops reading as
   choreography and starts reading as the interface being slow. Everything after
   the cap arrives with the last one. */
function stagger(root){
  const items = root.querySelectorAll(
    ".mbody > section, .mbody > .mcard > *, .mbody > .stats2, .mbody > .hint");
  items.forEach((el, i) => {
    el.style.setProperty("--si", Math.min(i, 11));
    el.classList.add("rise");
  });
}

/* ---- THE RIDE'S MS / EC BAR ------------------------------------------------
   The same `drawGauge` the profile card uses, and for the same reason it was
   ported in the first place: the number you carry into a fight should be drawn
   by the code that will draw it during one.

   It exists on the ride screen because that is where the decision is. Stamina
   only moves during a ride, orbs and triangles only appear during a ride, and
   the choice they create — take this enemy now, or catch one more first — is
   unanswerable without seeing both numbers. Everywhere else this bar would be
   decoration; here it is the instrument. */
const RideGauge = {
  ctx: null, dctx: null,
  attach(){
    const live = $("rGauge"), dead = $("rGaugeDead");
    if(!live || !dead){ this.ctx = null; return; }
    if(live.width !== RULES.gaugeW){
      live.width = dead.width = RULES.gaugeW;
      live.height = dead.height = RULES.gaugeH;
    }
    this.ctx = live.getContext("2d");
    this.dctx = dead.getContext("2d");
  },
  draw(){
    if(!this.ctx) this.attach();
    if(!this.ctx) return;
    const u = Player.gaugeUnit();
    drawGauge(this.ctx, this.dctx, u, {accent: GAUGE.mint});
    const ms = $("rTagMs"), ec = $("rTagEc");
    if(ms) ms.textContent = u.shownMs + " MS";
    if(ec){
      ec.textContent = u.shownEc + " EC";
      ec.classList.toggle("overcharged", u.shownEc > u.shownMs);
    }
  },
  /* On the game clock, and only while it is on screen — a canvas repainted
     behind a hidden strip is pure waste, the same rule MenuGauge follows. */
  step(){
    const el = $("rideStats");
    if(!el || !el.classList.contains("show")) return;
    gaugePhase++;
    this.draw();
  }
};
