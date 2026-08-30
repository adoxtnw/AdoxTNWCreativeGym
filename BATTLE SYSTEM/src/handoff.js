"use strict";
/* NEURO-METRO: AVUI — the map's half of the conversation, on this side
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   THIS FILE IS AN ADAPTER, NOT A FEATURE. Nothing about the fight, the intro
   or any animation lives here. It answers three questions and no others:

     - was this page opened BY the map, or by a person?
     - what state should the two units start in?
     - what does the map get told when it is over?

   WITHOUT `?handoff=1` IT DOES NOTHING AT ALL. The battle system opened on its
   own is exactly the battle system it was before this file existed, which is
   what keeps it possible to work on one prototype without running the other.

   WHY postMessage AND NOT `parent.something`. On file:// every origin is
   opaque, so reaching across the frame boundary directly is blocked outright —
   and this prototype has to keep opening off the disk. postMessage crosses an
   opaque boundary happily, so it is the only channel that works in both the
   places this thing actually runs.                                          */

const Handoff = {
  on: /(?:\?|&)handoff=1/.test(location.search),
  started: false,
  origin: null,          /* who asked; every reply goes back to them */

  /* Called at load, before anything has been rendered. */
  init(){
    if(!this.on) return;
    /* The title screen is the way IN to the game; arriving here from the map
       means that question has already been answered. Removed rather than
       hidden, so its button cannot be reached by a stray tab. */
    const t = $("title"); if(t) t.remove();
    addEventListener("message", e => this.hear(e));
    /* THE SAFETY NET, NOT THE PLAN. The theme starts with the intro (see
       `begin`), which works because the map grants this frame the autoplay
       permission it cannot earn for itself. If a browser refuses anyway, the
       first press in here wakes the context — and because a suspended context's
       clock is stopped, the theme then begins from its first note rather than
       joining part-way through. Not `once`: a refusal can outlive one tap. */
    /* EVERY EVENT A BROWSER MIGHT COUNT AS A GESTURE. Safari does not treat all
       of them alike, and which one unlocks audio is not something to be clever
       about — listening to all four costs nothing and `startMusic()` is a
       no-op once the music is genuinely running. */
    /* ...but not before we know WHO is being fought. `startMusic()` reads the
       enemy's own theme columns, and marks the music as playing whichever theme
       it started — so a stray touch in the half-second between READY and START
       would lock the ordinary theme in over a boss who has one of her own.
       `started` is set the moment the descriptor lands, which is well before any
       of this matters. */
    ["pointerdown", "touchstart", "click", "keydown"].forEach(t =>
      addEventListener(t, () => {
        if(!this.started) return;
        try{ audioAwake(); startMusic(); }catch(e){}
      }));
    /* Tell the map we exist. It waits for this before sending the descriptor,
       so a slow frame cannot miss the only message that matters. */
    this.post("AVUI_READY", {});
  },

  post(type, body){
    try{ parent.postMessage(Object.assign({type: type}, body), "*"); }catch(e){}
  },

  hear(e){
    const d = e.data;
    if(!d || d.type !== "AVUI_START" || this.started) return;
    this.started = true;
    this.origin = e.origin;
    this.begin(d.descriptor || {});
  },

  /* ---- what the two units start as -----------------------------------------
     The map is the authority on the player: their MS ceiling comes from their
     armor, their layers come from it too, and their abilities come from the
     three Move Sets they are carrying. Reading `units.player` here instead
     would quietly fight a whole progression system. */
  begin(d){
    const p = d.player || {};
    const u = S.player;
    if(p.maxMs){ u.maxMs = p.maxMs; }
    if(typeof p.ms === "number"){ u.ms = p.ms; u.shownMs = Math.round(p.ms); }
    if(typeof p.ec === "number"){ u.ec = p.ec; u.shownEc = Math.round(p.ec); }
    if(p.emotion) u.emotion = p.emotion;
    if(p.layers && p.layers.length)
      u.layers = p.layers.slice(0, RULES.maxLayers).map((e, i) => ({e, pos: i, flash: 0}));
    if(p.loadouts && p.loadouts.length){
      u.loadouts = p.loadouts.slice(0, RULES.equippedSlots);
      /* the pool is DERIVED from the Move Sets, by the same function the model
         uses when it builds a unit from the sheet */
      u.pool = poolFrom(u.loadouts);
    }
    /* The enemy is a units-sheet row, named by the map. `makeUnit` is the
       model's own constructor — a hand-built enemy here would be a second
       definition of what an enemy is. */
    const who = (d.enemies && d.enemies[0] && d.enemies[0].unit) || "enemy";
    if(UNITS[who]) S.enemy = makeUnit(who);
    this.enemyId = UNITS[who] ? who : "enemy";
    /* The rings are sized per fight, not per frame — tell them the enemy changed. */
    refreshEnemyShape();

    /* everything downstream reads S, so it only has to be rebuilt once */
    applyPersona(); buildPanel(); applyOverload(S.player); buildEnemyLine(); render();
    /* WITH THE INTRO, exactly as the title screen's button starts it — the
       theme is written to play over the diagonal line, not to arrive once the
       fight is already under way. */
    try{ audioAwake(); startMusic(); }catch(e){}
    intro();
  },

  /* ---- what the map is told, and when --------------------------------------
     `finish()` in battle.js calls this INSTEAD of putting up its own
     LINE CLEAR / BREAKDOWN card. The result is the shape battle-bridge.js has
     described since before there was anything to fill it in. */
  finish(kind){
    const rewards = kind === "win" ? rollDrops(this.enemyId || "enemy") : [];
    /* THREE ENDINGS NOW, not two. Running away is not a loss: nothing about the
       player's state is worse than it was, and the ride is not over — what it
       costs is Track Segments, and the map is the only side that knows what a
       Track Segment is, so it is told what happened and charges for it. */
    const result = {
      outcome: kind === "win" ? "WIN" : kind === "flee" ? "FLED" : "LOSS",
      ms: Math.max(0, Math.round(S.player.ms)),
      ec: Math.max(0, Math.round(S.player.ec)),
      rounds: S.round,
      rewards: rewards
    };
    /* A LOSS has nothing to celebrate and nothing to hand over, so it does not
       get a panel — the map is told at once and takes it from there. */
    if(kind !== "win"){ this.post("AVUI_RESULT", {result: result}); return; }
    showResults(result, () => this.post("AVUI_RESULT", {result: result}));
  }
};

/* ---- WHAT AN ENEMY LEAVES ---------------------------------------------------
   `drops` on the enemy's own row, as kind:amount:chance. Every kind is rolled
   SEPARATELY, so one enemy can leave everything, something or nothing — a
   single roll across all three would make the good haul and the empty one the
   same event, which is the opposite of what a drop table is for.

   The amount is "up to": rolling a 3 gives one, two or three, so two players
   who both got lucky still have different afternoons.                        */
function rollDrops(unitId){
  const row = UNITS[unitId]; if(!row) return [];
  const spec = Array.isArray(row.drops) ? row.drops : String(row.drops || "").split("|");
  const out = [];
  spec.forEach(s => {
    const b = String(s).split(":");
    if(b.length < 2) return;
    const kind = b[0].trim().toUpperCase();
    const amount = parseInt(b[1], 10) || 0;
    const chance = b.length > 2 ? parseFloat(b[2]) : 1;
    if(!kind || amount <= 0) return;
    if(Math.random() >= chance) return;
    const n = 1 + Math.floor(Math.random() * amount);
    out.push({kind: kind, n: n});
  });
  return out;
}

/* ---- THE RESULTS PANEL ------------------------------------------------------
   Built out of what this app already has: `.pxr` corners, the `.tstat` chip
   that every value tag in the game wears, and `unsheath()` — the same blade-
   out-of-its-sheath motion the interface uses when it first arrives. Using it
   again here is the point: what comes up after a fight has to look like it was
   made by the same hand as the fight.

   It waits for a tap. The rewards are the only thing the ride was FOR, and
   snatching them away on a timer would be reading the player's mail for them.
   It is also where the results song will play, once there is one.           */
const DROP_LABEL = {
  CRYSTAL: "EMOTION CRYSTAL",
  SEGMENT: "TRACK SEGMENT",
  ORB    : "STAMINA ORB"
};
/* An 8x8 from the same alphabet everything else in this app is drawn in, and a
   colour that says what KIND of thing it is: a crystal takes the emotion that
   was just beaten, a segment the interface's own ink, an orb the stamina mint
   the bar is drawn in. Three rows of identical grey boxes was a receipt. */
const DROP_ICON  = {CRYSTAL: "GLASS", SEGMENT: "CHARGE", ORB: "DROP"};
const DROP_COLOR = {SEGMENT: "#f0ece0", ORB: "#b0ffe1"};   /* on a dark chip; see .rsym */

async function showResults(result, done){
  const el = document.createElement("div");
  el.className = "results";
  const hex = emoHex(S.enemy.emotion);
  const rows = result.rewards.length
    ? result.rewards.map(r => {
        const col = DROP_COLOR[r.kind] || hex;
        return '<div class="rline pxr drawin" style="--rc:' + col + '">' +
          '<i class="rsym"><svg viewBox="0 0 8 8" shape-rendering="crispEdges">' +
            iconSVG(DROP_ICON[r.kind] || "SPARK") + '</svg></i>' +
          '<span class="rn">+' + r.n + '</span>' +
          '<span class="rk">' + (DROP_LABEL[r.kind] || r.kind) + '</span></div>';
      }).join("")
    : '<div class="rline pxr empty drawin"><span class="rk">NOTHING LEFT BEHIND</span></div>';
  /* THE TITLE IS THE SIZE OF THE THING THAT JUST HAPPENED, and it is in the
     colour of the emotion that was beaten — so winning against Joy and winning
     against Anger are not the same screen. `--emo` drives the fill and the
     glow together; the glow is what stops a large flat word reading as a
     placeholder. */
  el.style.setProperty("--emo", hex);
  el.innerHTML =
    '<h1 class="conquered hard drawin">EMOTION<br>CONQUERED!</h1>' +
    '<div class="rlines">' + rows + '</div>' +
    '<button class="depart pxr pxr-sh rgo drawin">BACK TO THE TRAIN</button>';
  $("screen").appendChild(el);

  /* WIRED BEFORE IT IS ANIMATED. Attaching this after the sequence meant the
     button was on screen for a second and a half before it did anything — a
     player who has seen the panel once and knows what it says taps it, nothing
     happens, and the interface reads as stuck. The one control here works from
     the moment it exists. */
  const go = el.querySelector(".rgo");
  go.addEventListener("click", () => {
    sfx("tap");
    el.classList.add("going");
    done();
  }, {once: true});

  /* EVERY ITEM STARTS HIDDEN — that is what `.drawin` is for, and leaving it off
     was a real bug rather than a nicety. `unsheath()` animates one element at a
     time down the list, so without it the whole panel was fully visible from the
     moment it was appended and then each row played its arrival on top of
     itself: you saw the reward, and then you watched it arrive. `unsheath()`
     removes the class as it takes over. */
  const items = [el.querySelector("h1")]
    .concat([].slice.call(el.querySelectorAll(".rline")))
    .concat([go]);
  for(let i = 0; i < items.length; i++){
    await unsheath(items[i], i % 2 === 0, i === 0 ? "clash" : "tap");
    await sleep(90);
  }
}

Handoff.init();
