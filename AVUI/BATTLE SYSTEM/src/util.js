"use strict";
/* NEURO-METRO: AVUI — small shared helpers
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */


const ICONS={
  BOLT :["....xxx.","...xxx..","..xxx...",".xxxxxx.","....xxx.","...xxx..","..xxx...",".xxx...."],
  DROP :["...xx...","...xx...","..xxxx..","..xxxx..",".xxxxxx.","xxxxxxxx",".xxxxxx.","..xxxx.."],
  SPARK:["...xx...","...xx...","x..xx..x",".xxxxxx.",".xxxxxx.","x..xx..x","...xx...","...xx..."],
  /* SURPRISE asks for this in the emotions sheet, and neither app had it — so
     `iconSVG` fell back to BOLT and Surprise wore Anger's symbol everywhere a
     glyph was drawn from the sheet. A core with spikes coming off it: related
     to SPARK, which is a clean four-point star, but deliberately busier. */
  BURST:["..x..x..","x.x..x.x",".xxxxxx.","..xxxx..",
         "..xxxx..",".xxxxxx.","x.x..x.x","..x..x.."],
  SHIELD:["xxxxxxxx","xxxxxxxx","xx....xx","xx....xx","xx....xx",".xx..xx.","..xxxx..","...xx..."],
  CHARGE:["...xx...","..xxxx..",".xxxxxx.","xxxxxxxx","...xx...","...xx...","...xx...","...xx..."],
  WARN :["...xx...","...xx...","..xxxx..","..x..x..",".xx..xx.",".x.xx.x.","xx.xx.xx","xxxxxxxx"],
  GLASS:[".xxx....","x...x...","x...x...","x...x...",".xxx....","...xx...","....xx..",".....xx."],
  ROT  :["..xxxx..",".x.xx.x.","xx.xx.xx","xxxxxxxx","x.xxxx.x","xx....xx",".x.xx.x.","..x..x.."],
  EYE  :["........",".xxxxxx.","x..xx..x","x.xxxx.x","x.xxxx.x","x..xx..x",".xxxxxx.","........"]
};
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* A backgrounded tab throttles animations, so `.finished` may never resolve —
   which would strand the opening sequence forever. Always race it against a
   timer so the sequence keeps moving no matter what the browser does. */
const waitAnim=(anim,ms)=>Promise.race([
  anim.finished.catch(()=>{}),
  sleep(ms+140)
]);
const R=(x,y)=>`<rect x="${x}" y="${y}" width="1" height="1"/>`;
const hexRGB=h=>[1,3,5].map(i=>parseInt(h.substr(i,2),16));
const emoHex=id=>id&&EMOTIONS[id]?EMOTIONS[id].hex:"#929fa5";
const emoName=id=>id&&EMOTIONS[id]?EMOTIONS[id].name.toUpperCase():"NEUTRAL";

/* ---- WHERE THE OTHER APP LIVES -------------------------------------------
   The two prototypes are sibling folders, and every link between them is built
   here. `MAP_APP` is what the folder is called on this disk.

   BUT THE NAME IS NOT TRUSTED, because it does not survive the trip. A case-only
   rename is invisible to git on macOS (`core.ignorecase` is true by default), so
   a folder committed once as `map` stays `map` in the repository however
   many times it is renamed locally — and GitHub Pages serves what the repository
   says, on Linux, where case is not negotiable. The result is a link that works
   on the machine that wrote it and 404s for everyone else.

   So instead of asserting the name, we ASK. `mapURLReady` probes the plausible
   spellings once at load and keeps the first that answers, so a deploy that
   renamed, lowercased or uppercased the folder still resolves. A HEAD request
   costs nothing and happens long before anyone taps anything.

   file:// cannot be probed — fetch refuses an opaque origin — so there the
   literal name is used, which is correct, because a local disk is the one place
   the name really is what it says. */
const MAP_APP = "MAP";
const mapURLCandidates = [MAP_APP, MAP_APP.toLowerCase(), MAP_APP.toUpperCase(),
                          MAP_APP.toLowerCase().replace(/ /g, "-"),
                          MAP_APP.toLowerCase().replace(/ /g, "")];
let mapURLBase = "../" + encodeURIComponent(MAP_APP) + "/";
const mapURLReady = (function(){
  const dedup = mapURLCandidates.filter((v, i, a) => a.indexOf(v) === i);
  if(location.protocol === "file:" || !window.fetch) return Promise.resolve(mapURLBase);
  return (async () => {
    for(const name of dedup){
      const base = "../" + encodeURIComponent(name) + "/";
      try{
        const res = await fetch(base + "index.html", {method: "HEAD"});
        if(res && res.ok){ mapURLBase = base; return base; }
      }catch(e){ /* try the next spelling */ }
    }
    /* None answered. Keep the literal: a wrong link that can be read in the
       address bar beats a silent refusal to navigate at all. */
    console.warn("could not find the MAP folder under any spelling; using " + mapURLBase);
    return mapURLBase;
  })();
})();
/* Await this when you are about to NAVIGATE or mount; read `mapURLBase` when you
   only need something to show. */
const mapURL = (page, query) => mapURLBase + page + (query || "");

/* ---- HOW HARD THIS DEVICE IS ASKED TO WORK ---------------------------------
   Two effects in this prototype are enormously more expensive than everything
   else put together, and both of them are invisible in a profiler until the
   page is already dead:

     THE SWIM. `#map` carries `filter:url(#mapWave)` — an feTurbulence whose
     baseFrequency is ANIMATED. An animated turbulence cannot be cached: the
     fractal noise is regenerated every frame, over the whole upscaled canvas.
     Measured here that is 2.48 MILLION device pixels of noise per repaint on a
     desktop at DPR 2, and an iPhone at DPR 3 is half again more. Safari renders
     SVG filters on the CPU and keeps a full-size backing store per filtered
     layer, and a WebContent process that runs out of room does not throw — it
     is killed, and Safari says "a problem repeatedly occurred".

     THE FROSTED PANELS. `backdrop-filter: blur()` over a live canvas is
     re-blurring the whole frame underneath, every frame, for as long as the
     panel is open.

   NEITHER IS LOAD-BEARING. The map is legible without the swim and the menu is
   legible without the blur, so on a device where they are a risk they are
   simply not drawn. Everything else is untouched.

   THIS IS A GUESS THAT CAN BE TESTED, WHICH IS WHY THERE IS A SWITCH.
   `?fx=full` forces both back on, `?fx=lite` forces both off, and the level is
   logged at boot — so a crash can be bisected on the actual phone in one
   reload rather than argued about. */
function applyFxLevel(){
  const m = /(?:\?|&)fx=(full|lite)/.exec(location.search);
  /* iPadOS reports itself as a Mac, hence the touch-point test. */
  const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
              (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const level = m ? m[1] : (iOS ? "lite" : "full");
  try{ document.documentElement.dataset.fx = level; }catch(e){}
  console.info("fx=" + level + (m ? " (forced by the URL)" : iOS ? " (iOS default)" : "") +
               " \u2014 ?fx=full / ?fx=lite to override");
  return level;
}
applyFxLevel();
