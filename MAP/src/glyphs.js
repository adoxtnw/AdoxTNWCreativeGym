"use strict";
/* NEURO-METRO: AVUI — MAP — the pixel glyphs the interface is built from
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   RE-DECLARED, NOT IMPORTED, like `src/util.js` — the two apps are siblings and
   must not reach into each other's source. What they genuinely share is the
   DATA: `abilities.icon` in the spreadsheet names one of these keys, so a new
   icon is added here and in the battle system's `util.js`, and the sheet keeps
   pointing at the same name.

   Every shape is drawn on a grid with `shape-rendering:crispEdges`, so it is
   made of the same square pixels as the map and the 3x5 font rather than being
   smooth vector art pretending to belong.                                    */

const ICONS = {
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
  EYE  :["........",".xxxxxx.","x..xx..x","x.xxxx.x","x.xxxx.x","x..xx..x",".xxxxxx.","........"],
  /* map-side additions, for headings that have no ability behind them */
  BAG  :["..xxxx..",".x....x.","xxxxxxxx","x......x","x.xxxx.x","x......x","x......x","xxxxxxxx"],
  DISC :["..xxxx..",".xxxxxx.","xxxxxxxx","xx.xx.xx","xxxxxxxx","xxxxxxxx",".xxxxxx.","..xxxx.."],
  KEY  :["..xxx...",".x...x..",".x...x..","..xxx...","...x....","...xxx..","...x....","...xx..."],
  FLOPPY:["xxxxxxxx","x..xx..x","x..xx..x","x......x","xxxxxxxx","x.xxxx.x","x.xxxx.x","xxxxxxxx"],
  PERSON:["..xxxx..","..xxxx..","..xxxx..","xxxxxxxx","x.xxxx.x","..xxxx..","..x..x..","..x..x.."]
};

const RECT = (x, y) => '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';

/* THE STATION RING — the shape an ability wears in the battle panel: a thick
   ring with a hard offset shadow, a dark interior, and an 8x8 glyph dropped in
   the middle. Reproduced exactly, because the whole point of showing a Move
   Set's abilities here is that they look like the same objects. */
const RN = 22;
function stationSVG(key){
  const c = (RN - 1) / 2, rO = RN / 2 - 0.5, rI = rO - 2.4;
  let ring = "", shadow = "", inner = "";
  for(let y = 0; y < RN; y++) for(let x = 0; x < RN; x++){
    const d = Math.hypot(x - c, y - c);
    if(d <= rO && d >= rI){ ring += RECT(x, y); shadow += RECT(x + 1, y + 1); }
    else if(d < rI){ inner += RECT(x, y); }
  }
  let icon = "";
  const g = key && ICONS[key];
  if(g) for(let y = 0; y < 8; y++) for(let x = 0; x < 8; x++)
    if(g[y][x] === "x") icon += RECT(x + 5, y + 5);
  return '<svg viewBox="0 0 ' + (RN + 1) + ' ' + (RN + 1) + '" shape-rendering="crispEdges">' +
    '<g fill="#0b0b0e">' + shadow + '</g><g fill="#1e1e26">' + inner + '</g>' +
    '<g fill="currentColor">' + ring + icon + '</g></svg>';
}
/* a charge segment: a small solid node, as in Paral·lel */
function chargeSVG(){
  const N = 10, c = (N - 1) / 2;
  let dot = "", sh = "";
  for(let y = 0; y < N; y++) for(let x = 0; x < N; x++)
    if(Math.hypot(x - c, y - c) <= c - 1){ dot += RECT(x, y); sh += RECT(x + 1, y + 1); }
  return '<svg viewBox="0 0 ' + (N + 1) + ' ' + (N + 1) + '" shape-rendering="crispEdges">' +
    '<g fill="#0c0a16">' + sh + '</g><g fill="currentColor">' + dot + '</g></svg>';
}
/* A bare glyph with a hard shadow, for headings and slot badges — the ring
   would be too loud next to a title. */
function glyphSVG(key){
  const g = ICONS[key]; if(!g) return "";
  let px = "", sh = "";
  for(let y = 0; y < 8; y++) for(let x = 0; x < 8; x++)
    if(g[y][x] === "x"){ px += RECT(x, y); sh += RECT(x + 1, y + 1); }
  return '<svg viewBox="0 0 9 9" shape-rendering="crispEdges">' +
    '<g fill="#0b0b0e">' + sh + '</g><g fill="currentColor">' + px + '</g></svg>';
}
/* An ability's accent. Typeless ones (Block, Recharge) would otherwise fall to
   FEAR's grey and read as an emotion they are not, so they take the stamina
   mint instead — the same rule the battle panel uses. */
const abAccent = a => a && a.emotion && EMOTIONS[a.emotion] ? EMOTIONS[a.emotion].hex : "#b0ffe1";

/* A PASSENGER PHOTO THAT IS NOT A PHOTO. Drawn on the same 8x8 grid as every
   other glyph so it belongs to the same alphabet — a smooth vector portrait
   next to this typeface would read as clip-art dropped in from elsewhere. It
   is deliberately anonymous: the card is the player's, and a face on it would
   be a claim about who they are that the game has no business making. */
const SILHOUETTE = [
  "..xxxx..",
  ".xxxxxx.",
  ".xxxxxx.",
  "..xxxx..",
  "...xx...",
  ".xxxxxx.",
  "xxxxxxxx",
  "xxxxxxxx"
];
function silhouetteSVG(){
  let r = "";
  SILHOUETTE.forEach((row, y) => {
    for(let x = 0; x < row.length; x++) if(row[x] === "x") r += RECT(x, y);
  });
  return '<svg viewBox="0 0 8 8" width="100%" height="100%" ' +
         'shape-rendering="crispEdges" fill="currentColor">' + r + '</svg>';
}
