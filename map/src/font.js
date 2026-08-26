"use strict";
/* NEURO-METRO: AVUI — MAP — 3x5 bitmap font
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   WHY A HAND-DRAWN FONT. `fillText` antialiases no matter what
   `imageSmoothingEnabled` says — that flag only governs image SCALING. Text
   drawn into the low-res buffer would therefore arrive as grey half-pixels and
   upscale into mush. Every glyph here is authored on the same grid the map is
   rasterised on, so a label is made of exactly the same pixels as a line.

   3 wide, 5 tall, 1px of air between glyphs -> a 4px advance.              */
const FONT_W = 3, FONT_H = 5, FONT_ADV = 4;

const GLYPHS = {
  "A":[".x.","x.x","xxx","x.x","x.x"], "B":["xx.","x.x","xx.","x.x","xx."],
  "C":[".xx","x..","x..","x..",".xx"], "D":["xx.","x.x","x.x","x.x","xx."],
  "E":["xxx","x..","xx.","x..","xxx"], "F":["xxx","x..","xx.","x..","x.."],
  "G":[".xx","x..","x.x","x.x",".xx"], "H":["x.x","x.x","xxx","x.x","x.x"],
  "I":["xxx",".x.",".x.",".x.","xxx"], "J":["..x","..x","..x","x.x",".x."],
  "K":["x.x","x.x","xx.","x.x","x.x"], "L":["x..","x..","x..","x..","xxx"],
  "M":["x.x","xxx","xxx","x.x","x.x"], "N":["xx.","x.x","x.x","x.x","x.x"],
  "O":["xxx","x.x","x.x","x.x","xxx"], "P":["xx.","x.x","xx.","x..","x.."],
  "Q":["xxx","x.x","x.x","xxx","..x"], "R":["xx.","x.x","xx.","x.x","x.x"],
  "S":[".xx","x..",".x.","..x","xx."], "T":["xxx",".x.",".x.",".x.",".x."],
  "U":["x.x","x.x","x.x","x.x","xxx"], "V":["x.x","x.x","x.x","x.x",".x."],
  "W":["x.x","x.x","xxx","xxx","x.x"], "X":["x.x","x.x",".x.","x.x","x.x"],
  "Y":["x.x","x.x",".x.",".x.",".x."], "Z":["xxx","..x",".x.","x..","xxx"],
  "0":["xxx","x.x","x.x","x.x","xxx"], "1":[".x.","xx.",".x.",".x.","xxx"],
  "2":["xx.","..x",".x.","x..","xxx"], "3":["xxx","..x",".xx","..x","xxx"],
  "4":["x.x","x.x","xxx","..x","..x"], "5":["xxx","x..","xx.","..x","xx."],
  "6":[".xx","x..","xxx","x.x","xxx"], "7":["xxx","..x",".x.",".x.",".x."],
  "8":["xxx","x.x","xxx","x.x","xxx"], "9":["xxx","x.x","xxx","..x","xx."],
  ".":["...","...","...","...",".x."], "-":["...","...","xxx","...","..."],
  "'":[".x.",".x.","...","...","..."], "/":["..x","..x",".x.","x..","x.."],
  "+":["...",".x.","xxx",".x.","..."], "·":["...","...",".x.","...","..."],
  " ":["...","...","...","...","..."]
};

/* Catalan station names carry accents the font has no room for. Fold them to
   the base letter rather than dropping the glyph, so PARAL.LEL and CRUILLA
   still read even before the real names arrive from the spreadsheet. */
const foldText = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

const textW = s => s.length ? s.length * FONT_ADV - 1 : 0;
