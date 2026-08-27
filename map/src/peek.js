"use strict";
/* NEURO-METRO: AVUI — MAP — reading a station from the map
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   Tapping any station opens this (GDD 2, Station Inspection). It is also how a
   destination is chosen — a separate "pick a destination" mode would be a
   second way to say the same thing, and this one already has to be built.

   FOG HIDES IT. When a station's live fog is at or past `fogPeekHide` the
   details are withheld and the panel says so; the GDD makes visibility a real
   modifier rather than decoration, so the panel has to be able to refuse.

   Everything here is DOM, like the rest of the HUD — the canvas is for the
   world, not for panels of text.                                             */

const Peek = {
  open: false,
  id: null,

  show(id){
    if(!STATIONS[id]) return;
    this.open = true; this.id = id;
    /* A DESTINATION YOU CAN ACTUALLY REACH gets the camera's attention: centred,
       then leaned. Somewhere you are already standing, or cannot get to, does
       not — the lean is a promise, and it should not be made falsely. */
    const r = routeFor(id);
    if(id !== Player.at && r.ok){
      const s = STATIONS[id];
      camTo(s.x, s.y, Math.max(cam.z, 1.5));
      /* lean away from whichever edge the station is nearest, so the map does
         not swing the destination off screen */
      leanTo(bx(s.x) > W / 2 ? -1 : 1);
    }else leanOff();
    sfx("ui_station");
    this.render();
    syncHud();
    dirty = true;
  },
  hide(){ this.open = false; this.id = null; leanOff(); this.render(); syncHud(); dirty = true; },

  /* THE LINES THIS TRIP ACTUALLY RIDES — not every line that happens to call at
     a station on the way. A route through Passeig de Gràcia does not become a
     Line 3 journey because Line 3 stops there; only lines a LEG is ridden on
     count, in the order they are ridden. That list is what colours the panel. */
  tripLines(r){
    const out = [];
    (r && r.legs || []).forEach(l => { if(out.indexOf(l.line) < 0) out.push(l.line); });
    return out;
  },
  /* A gradient that loops seamlessly: the first colour is repeated at the end,
     so the scroll has no visible seam. One colour still needs two stops. */
  tripGradient(lines){
    const hex = lines.map(l => EMOTIONS[l.emotion].hex);
    if(!hex.length) return "linear-gradient(90deg,#5c5348,#5c5348)";
    /* A TRIP ON ONE LINE STILL HAS TO MOVE. A single colour makes a flat band,
       and a flat band is the one thing on this panel that says nothing is
       happening — on a journey that is entirely on the red line, the red IS the
       information. So it scrolls against a darker version of ITSELF: the same
       hue travelling, rather than a second colour that would imply a second
       line in the trip. */
    if(hex.length === 1){
      const c = hexRGB(hex[0]);
      const dark = rgbHex([c[0] * 0.40, c[1] * 0.40, c[2] * 0.40]);
      return "linear-gradient(90deg," + hex[0] + "," + dark + "," + hex[0] + ")";
    }
    const stops = hex.concat([hex[0]]).join(",");
    return "linear-gradient(90deg," + stops + ")";
  },

  render(){
    const el = $("peek"); if(!el) return;
    el.classList.toggle("show", this.open);
    if(!this.open){ el.innerHTML = ""; el.style.removeProperty("--trip"); return; }
    const s = STATIONS[this.id];
    const a = stationAttrs(this.id);
    const fogged = isFogged(this.id);
    const r = routeFor(this.id);
    const lines = (LINES_AT[this.id] || []);
    const trip = this.tripLines(r);

    /* the bob is offset per line, so two tags side by side drift out of step
       instead of moving as one block */
    let chipN = 0;
    const chip = l => '<span class="lchip" style="background:' +
      EMOTIONS[l.emotion].hex + ';--fd:' + ((chipN++ * 0.29).toFixed(2)) + 's">' +
      l.id + '</span>';
    const rate = v => v >= 1.25 ? "high" : v <= 0.8 ? "low" : "normal";

    let body;
    if(fogged){
      body = '<p class="fogged">Obscured. Too much fog on the line to read this ' +
             'station from here.</p>';
    }else{
      body =
        '<dl>' +
        row("Weather", WorldState.weather()) +
        row("Threat",  rate(a.density) + " &middot; &times;" + a.density.toFixed(2)) +
        row("Aggro",   rate(a.aggro)   + " &middot; &times;" + a.aggro.toFixed(2)) +
        row("Distance", segmentsFor(this.id) + " segments") +
        (s.state ? row("State", s.state) : "") +
        '</dl>';
    }

    let head, action;
    if(this.id === Player.at){
      head = '<h2>' + esc(s.name) + '</h2>';
      action = '<p class="note">You are here.</p>';
    }else if(r.ok){
      /* FROM here TO there, with the journey drawn between them — the
         destination alone never said where you were leaving from. */
      head = '<div class="trip">' +
          '<b class="tfrom">' + esc((STATIONS[Player.at] || {}).name || "") + '</b>' +
          '<span class="tarrow">' + waveArrow() + '</span>' +
          '<b class="tto">' + esc(s.name) + '</b>' +
        '</div>' +
        '<div class="lchips tlines">' + trip.map(chip).join("") + '</div>';
      action = '<button class="pbtn trip pxr hudbtn" id="peekGo">' +
        '<span>&ldquo;EMOTIONAL TRIP&rdquo;</span><small>' + r.legs.length +
        ' STOP' + (r.legs.length === 1 ? '' : 'S') + '</small></button>';
    }else{
      head = '<h2>' + esc(s.name) + '</h2>';
      if(r.reason === "NO_KEY"){
        const need = (r.need || []);
        action = '<p class="warn">No route. You need the Line Key for ' +
                 (r.any && need.length > 1 ? "any of " : "") + need.join(", ") + '.</p>';
      }else action = '<p class="warn">No route from here.</p>';
    }

    /* the scrolling stroke, and the button, share one gradient */
    el.style.setProperty("--trip", this.tripGradient(trip));
    el.classList.toggle("hasTrip", trip.length > 0);

    el.innerHTML =
      '<button class="pclose pxr hudbtn" id="peekClose">&times;</button>' +
      head +
      (this.id === Player.at || !r.ok
        ? '<div class="lchips">' + lines.map(chip).join("") + '</div>' : "") +
      body + action;

    const go = $("peekGo");
    if(go) go.addEventListener("click", () => {
      const res = Run.begin(Peek.id);
      if(res.ok) Peek.hide();
    });
    $("peekClose").addEventListener("click", () => Peek.hide());
  }
};

/* A chunky arrow whose shaft ripples — seven bars, each a beat behind the last,
   so the motion runs from the station you are leaving toward the one you are
   going to rather than pulsing in place.

   The COUNT is fixed and the WIDTHS are not: the bars stretch to fill whatever
   the two names leave between them (see .tarrow in map.css), so the arrow spans
   its gap without needing to be measured. Seven rather than five because the
   bars are wider now, and four would read as a row of blocks rather than as a
   wave travelling along a shaft. */
function waveArrow(){
  let bars = "";
  for(let i = 0; i < 7; i++)
    bars += '<i style="animation-delay:' + (i * -0.1).toFixed(2) + 's"></i>';
  return bars + '<u></u>';
}

const row = (k, v) => '<dt>' + k + '</dt><dd>' + v + '</dd>';
const esc = s => String(s).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
