"use strict";
/* NEURO-METRO: AVUI — MAP — getting a save out of the browser and back in
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   THE PROBLEM THIS SOLVES. The game is uploaded to a static host, so there is
   no server to save to, and `localStorage` is not a safe place to leave
   anything: it is per-browser, it dies with "clear site data", and on iOS it is
   DELETED AFTER SEVEN DAYS without a visit. A friend who plays and comes back a
   fortnight later would find nothing.

   So a save has to be something a player can HOLD:

     a JSON FILE they download and can load back, on any device, forever
     a CODE they can paste into a message

   Both carry the same bytes as the autosave — `Player.toJSON()` is the single
   serialiser — so none of the three can drift from the others.

   AN ENVELOPE, NOT A BARE BLOB. Every export is wrapped with a game id, a kind
   and a version. Without it, dropping in an unrelated JSON would half-load and
   leave a corrupted profile; with it the importer can say exactly what is wrong
   and change nothing.

   EVERYTHING HERE IS UNTRUSTED INPUT. A file arrives from a friend, from a
   phone, from a text editor someone "fixed" by hand. It is parsed, never
   evaluated, and handed to `Player.fromJSON()`, which checks every field
   against the live tables. Nothing here writes to the DOM.                   */

const GAME_ID = "neuro-metro-avui";
const CODE_PREFIX = "NMAVUI1:";
const SNAP_PREFIX = "nm.avui.snap.";

const Vault = {
  /* THE SEAM FOR CLOUD SYNC. A backend has to satisfy two calls —
     `put(code, envelope)` and `get(code)` — and nothing else in the codebase
     changes. Left null on purpose: there is no server yet, and a half-wired one
     would be worse than none. */
  remote: null,

  /* ---- the envelope ---- */
  wrap(){
    return {
      game: GAME_ID, kind: "save", v: 2,
      code: Player.code || "",
      savedAt: new Date().toISOString(),
      profile: Player.toJSON()
    };
  },
  /* Returns {ok, profile} or {ok:false, why} — a sentence fit to show someone. */
  unwrap(obj){
    if(!obj || typeof obj !== "object") return bad("That is not a save file.");
    if(obj.game && obj.game !== GAME_ID)
      return bad("That save is from a different game.");
    /* a bare profile blob (an old export, or someone's hand-edit) still loads */
    const p = obj.profile && typeof obj.profile === "object" ? obj.profile
            : (obj.v === 1 || obj.v === 2) ? obj : null;
    if(!p) return bad("That file does not have a profile in it.");
    if(p.v !== 1 && p.v !== 2)
      return bad("That save was made by a newer version of the game.");
    return {ok: true, profile: p, code: obj.code || p.code || ""};
  },

  /* ---- files: the one that actually survives ------------------------------
     `<a download>` for out and `<input type=file>` for in. Deliberately not a
     drop target: dragging a file is impossible on the phones this is played
     on. */
  fileName(){
    const code = (Player.code || "SAVE").replace(/[^0-9A-Za-z]/g, "");
    return "neuro-metro-" + code + "-" + new Date().toISOString().slice(0, 10) + ".json";
  },
  exportFile(){
    try{
      const text = JSON.stringify(this.wrap(), null, 2);
      const url = URL.createObjectURL(new Blob([text], {type: "application/json"}));
      const a = document.createElement("a");
      a.href = url; a.download = this.fileName();
      document.body.appendChild(a); a.click(); a.remove();
      /* the object URL pins the blob in memory until it is let go */
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return {ok: true, name: this.fileName()};
    }catch(e){ return bad("Could not make the file: " + e.message); }
  },
  /* `after(result)` because FileReader is asynchronous. */
  importFile(file, after){
    if(!file) return after(bad("No file chosen."));
    if(file.size > 512 * 1024) return after(bad("That file is far too big to be a save."));
    const fr = new FileReader();
    fr.onerror = () => after(bad("Could not read that file."));
    fr.onload = () => {
      let obj; try{ obj = JSON.parse(fr.result); }
      catch(e){ return after(bad("That file is not readable JSON.")); }
      after(this.adopt(obj));
    };
    fr.readAsText(file);
  },

  /* ---- codes: for pasting into a message ---------------------------------- */
  exportCode(){
    try{
      const b64 = b64urlEncode(JSON.stringify(this.wrap()));
      return {ok: true, code: CODE_PREFIX + b64 + "." + checksum(b64)};
    }catch(e){ return bad("Could not make a code: " + e.message); }
  },
  importCode(str){
    let s = String(str || "").trim().replace(/\s+/g, "");
    if(!s) return bad("Paste a save code first.");
    if(s.indexOf(CODE_PREFIX) !== 0) return bad("That does not look like a save code.");
    s = s.slice(CODE_PREFIX.length);
    const dot = s.lastIndexOf(".");
    if(dot < 0) return bad("That code is missing its checksum — it may have been cut short.");
    const body = s.slice(0, dot), sum = s.slice(dot + 1);
    /* THE CHECKSUM EARNS ITS KEEP HERE. Codes get truncated by chat apps and
       line-wrapped by mail. Without this a clipped paste decodes to plausible
       JSON and silently loads half a profile. */
    if(checksum(body) !== sum) return bad("That code is damaged or incomplete.");
    let obj; try{ obj = JSON.parse(b64urlDecode(body)); }
    catch(e){ return bad("That code could not be read."); }
    return this.adopt(obj);
  },

  /* ---- adopting ----------------------------------------------------------- */
  /* Replaces the live profile. The caller is responsible for asking first —
     see the SAVE tab, which offers to export the current one before it does. */
  adopt(obj){
    const r = this.unwrap(obj);
    if(!r.ok) return r;
    const interrupted = Player.fromJSON(r.profile);
    if(!Player.code) Player.code = sanitiseCode(r.code) || makeCode();
    Player.save();
    return {ok: true, interrupted, name: Player.name, code: Player.code};
  },

  /* ---- local snapshots ----------------------------------------------------
     Named saves parked in storage, so a profile can be swapped without a
     download-and-upload round trip. For testing, mostly — they live in the same
     storage as the autosave and die with it, which is exactly why they are not
     the backup. Files are the backup. */
  snapNames(){
    const out = [];
    try{
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(k && k.indexOf(SNAP_PREFIX) === 0) out.push(k.slice(SNAP_PREFIX.length));
      }
    }catch(e){}
    return out.sort();
  },
  snapSave(name){
    const n = String(name || "").trim().slice(0, 24);
    if(!n) return bad("Give the snapshot a name.");
    try{ localStorage.setItem(SNAP_PREFIX + n, JSON.stringify(this.wrap())); }
    catch(e){ return bad("Storage refused: " + e.message); }
    return {ok: true, name: n};
  },
  snapLoad(name){
    let raw = null;
    try{ raw = localStorage.getItem(SNAP_PREFIX + name); }catch(e){}
    if(!raw) return bad("No snapshot by that name.");
    let obj; try{ obj = JSON.parse(raw); }catch(e){ return bad("That snapshot is corrupt."); }
    return this.adopt(obj);
  },
  snapDrop(name){
    try{ localStorage.removeItem(SNAP_PREFIX + name); }catch(e){}
    return {ok: true};
  },

  /* ---- starting over ---- */
  wipe(){
    try{ localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_KEY_V1); }catch(e){}
    Player.code = ""; Player.name = ""; Player.affinities = [];
    return {ok: true};
  }
};

const bad = why => ({ok: false, why});

/* ---- base64url over UTF-8 --------------------------------------------------
   `btoa` only takes latin-1, so the JSON is percent-encoded first — a station
   name with an accent in it would otherwise throw. And the URL-safe alphabet
   because a code may well end up in a link. */
function b64urlEncode(str){
  const bin = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
                (_, h) => String.fromCharCode(parseInt(h, 16)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s){
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while(s.length % 4) s += "=";
  const bin = atob(s);
  let out = "";
  for(let i = 0; i < bin.length; i++)
    out += "%" + ("0" + bin.charCodeAt(i).toString(16)).slice(-2);
  return decodeURIComponent(out);
}
/* Not a hash — a smudge detector. It only has to catch truncation and a
   mistyped character, which is all that happens to a pasted string. */
function checksum(s){
  let h = 2166136261;
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36).slice(0, 6);
}
