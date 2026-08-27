"use strict";
/* NEURO-METRO: AVUI — MAP — handing a fight to the battle system
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   WHY A FRAME AND NOT A NAVIGATION.

   The ride has to be waiting when the fight ends — mid-travel, at line speed,
   with the same elements in the air and the same music. Navigating away and
   back would throw all of that on the floor and the train would pull out from
   a standing start on the other side. A frame leaves the map running in memory
   and untouched, which is also why neither prototype had to be rebuilt to make
   this work: the battle system is not being imported, it is being ASKED.

   WHY postMessage AND NOT `frame.contentWindow.something`. Under file:// every
   origin is opaque, so reaching across the boundary directly is refused
   outright — and this thing has to keep opening off the disk. postMessage
   crosses an opaque boundary happily.

   THE FRAME IS ALWAYS TORN DOWN. A battle system left mounted keeps its own
   clock, its own audio graph and its own rAF loop running behind the map for
   the rest of the session. `close()` is called on every exit path, including
   the ones that failed.                                                     */

const BattleFrame = {
  el: null, waiting: null, ready: false,

  /* The whole handover, as one promise the caller can await. */
  open(descriptor, enemyUnit){
    if(this.el) return Promise.reject(new Error("a battle is already up"));
    return new Promise(resolve => {
      this.waiting = resolve;
      this.ready = false;

      const f = document.createElement("iframe");
      f.id = "battleFrame";
      f.setAttribute("title", "battle");
      /* AUTOPLAY IS A PERMISSION, AND IT HAS TO BE HANDED OVER.
         A frame does not inherit the parent's right to make noise — under
         file:// it is a different origin entirely, and even same-origin it has
         no user activation of its own, because the tap that started the fight
         happened in THIS document. Without the grant its AudioContext cannot
         leave `suspended`, and the battle theme sits silent behind an intro it
         was written to play over. `allow` delegates the permission the parent
         already earned. */
      f.setAttribute("allow", "autoplay; fullscreen");
      /* ...WHICH FILE:// CANNOT ACCEPT. Every file:// document has an OPAQUE
         origin, and a Permissions Policy feature cannot be granted to one — so
         the line above is quietly ignored there. Nor does the tap that started
         the fight reach the frame: user activation propagates only to
         SAME-ORIGIN descendants, and two opaque origins are never same-origin.

         The battle theme therefore cannot start on its own off the disk, and no
         amount of code changes that; it waits for the first touch inside the
         fight instead. Over http — which is what the deployed build is — the
         grant works and the theme plays over the intro. Said out loud because a
         silence with no explanation is the kind of thing that gets debugged
         twice. */
      if(location.protocol === "file:")
        console.info("file:// — the battle theme cannot autoplay here (opaque origin); " +
                     "it starts on the first touch in the fight. Serve over http " +
                     "(shared/tools/serve.py --all) and it plays over the intro.");
      /* `?handoff=1` is the whole switch. Without it the battle system boots as
         itself, title screen and all; with it, it waits to be told who is
         fighting whom. */
      f.src = "../BATTLE SYSTEM/index.html?handoff=1";
      this.el = f;
      $("screen").appendChild(f);

      /* THE FRAME SPEAKS FIRST. Sending the descriptor on a timer would be a
         race against however long the battle system takes to parse fourteen
         scripts on a cold phone; waiting for its READY is not a race at all. */
      this._onMsg = e => {
        const d = e.data; if(!d) return;
        if(d.type === "AVUI_READY"){
          this.ready = true;
          const body = Object.assign({}, descriptor);
          /* which units-sheet row this element fights as (travel_elements.unit) */
          body.enemies = [{unit: enemyUnit || "enemy"}];
          try{ f.contentWindow.postMessage({type: "AVUI_START", descriptor: body}, "*"); }catch(err){}
          return;
        }
        if(d.type === "AVUI_RESULT"){ this.done(d.result); }
      };
      addEventListener("message", this._onMsg);

      /* If the frame never answers — a file:// path that does not resolve, a
         script error on the far side — the ride must not be stranded inside a
         phase nothing can leave. Answer for it. */
      this._giveUp = setTimeout(() => {
        if(!this.ready) this.done(null);
      }, 12000);
    });
  },

  done(result){
    clearTimeout(this._giveUp);
    const r = this.waiting; this.waiting = null;
    if(!r) return;
    r(result);
  },

  /* THE FADE TO WHITE IS THE UNLOAD. It covers the swap so the frame's
     teardown is never seen, and it is still fading as the travel scene comes
     back underneath — which is what makes the return read as surfacing rather
     than as a screen being replaced. */
  close(){
    return new Promise(res => {
      const flash = $("battleFlash");
      const ms = num(RULES.battleFadeMs, 620);
      if(flash){
        flash.classList.add("on");
        setTimeout(() => {
          this.drop();
          flash.classList.add("out");
          setTimeout(() => { flash.classList.remove("on", "out"); res(); }, ms);
        }, Math.round(ms * 0.45));
      }else{ this.drop(); res(); }
    });
  },
  drop(){
    if(this._onMsg){ removeEventListener("message", this._onMsg); this._onMsg = null; }
    if(this.el){ this.el.remove(); this.el = null; }
    const cv = $("battleWipe"); if(cv) cv.classList.remove("on");
  }
};

/* ---- THE CURTAIN --------------------------------------------------------
   Ported verbatim from the battle system's `screens.js`, the way `gauge.js`
   was, and for the same reason: the map's own circular wipe is drawn into its
   pixel BUFFER, and a buffer cannot reveal a DOM element. This one is exactly a
   DOM curtain — an opaque canvas with a growing transparent hole and a thick
   pixelated leading ring — which is what the frame underneath needs.

   A timer rather than rAF, also as in the original: rAF is suspended outright
   on a hidden tab and the opening would hang there for ever. The safety
   timeout is the same insurance.                                            */
function battleWipeReveal(ms){
  const cv = $("battleWipe"), sr = $("screen").getBoundingClientRect();
  const PX = 6, RING = 4;
  /* A FRAME THAT HAS NOT BEEN LAID OUT — or is in a hidden tab — REPORTS ZERO,
     and `createImageData(0, 0)` throws. `resize()` has guarded against exactly
     this since the map was built; the curtain has to as well, because the throw
     lands somewhere far worse: see the try/catch below. */
  const W = Math.max(2, Math.ceil((sr.width  || 0) / PX));
  const H = Math.max(2, Math.ceil((sr.height || 0) / PX));
  cv.width = W; cv.height = H;
  cv.style.width = (W * PX) + "px"; cv.style.height = (H * PX) + "px";
  cv.classList.add("on");
  const ctx = cv.getContext("2d");
  const cx = W / 2, cy = H / 2, maxR = Math.sqrt(cx * cx + cy * cy) + RING + 2;
  const t0 = performance.now();
  return new Promise(res => {
    let done = false;
    const finish = () => { if(done) return; done = true;
      clearInterval(iv); clearTimeout(safety); res(); };
    /* WRAPPED, BECAUSE THE FIRST CALL IS SYNCHRONOUS. `draw()` runs once before
       this executor returns, so a throw inside it does not merely skip a frame —
       it rejects the promise, `launch()` catches the rejection, decides the
       fight never happened and hands back a blank result. One bad rect silently
       skipped the entire battle. A curtain that fails to draw must degrade to a
       curtain that is simply not drawn. */
    const draw = () => { try{ paint(); }catch(err){ finish(); } };
    const paint = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const r = k * k * maxR;                       /* accelerates, as the original does */
      const img = ctx.createImageData(W, H), D = img.data;
      for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d = Math.sqrt(dx * dx + dy * dy), o = (y * W + x) * 4;
        if(d < r - RING) continue;                                  /* revealed */
        if(d < r){ D[o] = D[o+1] = D[o+2] = 255; D[o+3] = 255; }     /* the ring */
        else     { D[o+3] = 255; }                                  /* curtained */
      }
      ctx.putImageData(img, 0, 0);
      if(k >= 1){ ctx.clearRect(0, 0, W, H); cv.classList.remove("on"); finish(); }
    };
    const iv = setInterval(draw, 16);
    const safety = setTimeout(() => {
      ctx.clearRect(0, 0, W, H); cv.classList.remove("on"); finish();
    }, ms + 600);
    draw();
  });
}

/* ---- WHAT A WON FIGHT LEAVES BEHIND ---------------------------------------
   Every kind goes through the machinery that already handles it: crystals
   through the vault, segments through the trip bar's own tween and sound, orbs
   through MS. Nothing here invents a second way to receive something.

   ORBS ONLY MEAN ANYTHING MID-RIDE, which is exactly when they are given: MS
   is restored in full the moment the player is back on the map, so a Stamina
   Orb is a decision about whether THIS ride can continue, not a permanent gain.
   That is the same reason MS is the only thing that ends a run.             */
function applyRewards(result){
  if(!result || !result.rewards || !result.rewards.length) return [];
  const got = [];
  result.rewards.forEach(r => {
    const n = Math.max(0, r.n | 0); if(!n) return;
    if(r.kind === "CRYSTAL"){
      if(Run.active && J.line) Run.addCrystal(J.line.emotion, n);
      got.push(n + "x crystal");
    }else if(r.kind === "SEGMENT"){
      /* through the bar's own tween, so it surges and sounds exactly as it
         does when a segment is caught on the track */
      Trip.from = Trip.shown; Trip.tw = 0;
      Trip.collected += n;
      Trip.flash = num(RULES.tripFlashMs, 260);
      sfx("map_tripup");
      got.push(n + "x segment");
    }else if(r.kind === "ORB"){
      const back = Player.maxMs * num(RULES.orbMsPct, 0.18) * n;
      Player.ms = Math.min(Player.maxMs, Player.ms + back);
      got.push(n + "x orb");
    }
  });
  return got;
}
