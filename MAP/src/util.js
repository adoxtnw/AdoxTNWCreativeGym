"use strict";
/* NEURO-METRO: AVUI — MAP — small shared helpers
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   These are deliberately RE-DECLARED rather than imported from the battle
   system. The two apps are siblings, not a library and a consumer: reaching
   across into `../BATTLE SYSTEM/src/` is the exact coupling the workspace
   split exists to prevent, and it would make a change to battle's helpers
   able to break the map silently. Three lines of duplication is the cheaper
   half of that trade. What the two apps DO share — the emotion palette — is
   shared properly, through the spreadsheet.                               */

const $ = id => document.getElementById(id);
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
/* A spreadsheet cell that should be a number but may be blank. Lives here
   because EVERY file shares one global scope: two files declaring `const num`
   is not shadowing, it is a SyntaxError that kills whichever loads second —
   and the failure looks like the feature was never wired up. */
const num = (v, d) => (v === "" || v == null || isNaN(+v)) ? (d || 0) : +v;

/* Copy, with the fallback iOS Safari still needs. `navigator.clipboard` is
   absent on file:// and on any non-secure origin, which is exactly where this
   prototype often runs, so the old execCommand path is not optional. */
function copyText(text, after){
  const done = ok => { if(after) after(ok); };
  try{
    if(navigator.clipboard && window.isSecureContext)
      return navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
  }catch(e){}
  try{
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99999);
    const ok = document.execCommand("copy");
    ta.remove(); done(ok);
  }catch(e){ done(false); }
}

/* ---- WHERE THE OTHER APP LIVES -------------------------------------------
   The two prototypes are sibling folders, and every link between them is built
   here. `BATTLE_APP` is what the folder is called on this disk.

   BUT THE NAME IS NOT TRUSTED, because it does not survive the trip. A case-only
   rename is invisible to git on macOS (`core.ignorecase` is true by default), so
   a folder committed once as `battle system` stays `battle system` in the repository however
   many times it is renamed locally — and GitHub Pages serves what the repository
   says, on Linux, where case is not negotiable. The result is a link that works
   on the machine that wrote it and 404s for everyone else.

   So instead of asserting the name, we ASK. `battleURLReady` probes the plausible
   spellings once at load and keeps the first that answers, so a deploy that
   renamed, lowercased or uppercased the folder still resolves. A HEAD request
   costs nothing and happens long before anyone taps anything.

   file:// cannot be probed — fetch refuses an opaque origin — so there the
   literal name is used, which is correct, because a local disk is the one place
   the name really is what it says. */
const BATTLE_APP = "BATTLE SYSTEM";
const battleURLCandidates = [BATTLE_APP, BATTLE_APP.toLowerCase(), BATTLE_APP.toUpperCase(),
                          BATTLE_APP.toLowerCase().replace(/ /g, "-"),
                          BATTLE_APP.toLowerCase().replace(/ /g, "")];
let battleURLBase = "../" + encodeURIComponent(BATTLE_APP) + "/";
const battleURLReady = (function(){
  const dedup = battleURLCandidates.filter((v, i, a) => a.indexOf(v) === i);
  if(location.protocol === "file:" || !window.fetch) return Promise.resolve(battleURLBase);
  return (async () => {
    for(const name of dedup){
      const base = "../" + encodeURIComponent(name) + "/";
      try{
        const res = await fetch(base + "index.html", {method: "HEAD"});
        if(res && res.ok){ battleURLBase = base; return base; }
      }catch(e){ /* try the next spelling */ }
    }
    /* None answered. Keep the literal: a wrong link that can be read in the
       address bar beats a silent refusal to navigate at all. */
    console.warn("could not find the BATTLE SYSTEM folder under any spelling; using " + battleURLBase);
    return battleURLBase;
  })();
})();
/* Await this when you are about to NAVIGATE or mount; read `battleURLBase` when you
   only need something to show. */
const battleURL = (page, query) => battleURLBase + page + (query || "");
