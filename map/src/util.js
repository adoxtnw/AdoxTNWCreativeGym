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
