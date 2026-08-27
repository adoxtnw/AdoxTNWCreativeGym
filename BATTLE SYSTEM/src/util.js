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
