"use strict";
/* NEURO-METRO: AVUI — small shared helpers
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */


const ICONS={
  BOLT :["....xxx.","...xxx..","..xxx...",".xxxxxx.","....xxx.","...xxx..","..xxx...",".xxx...."],
  DROP :["...xx...","...xx...","..xxxx..","..xxxx..",".xxxxxx.","xxxxxxxx",".xxxxxx.","..xxxx.."],
  SPARK:["...xx...","...xx...","x..xx..x",".xxxxxx.",".xxxxxx.","x..xx..x","...xx...","...xx..."],
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
