"use strict";
/* NEURO-METRO: AVUI — pixel glyphs and SVG builders
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */

/* ================= PIXEL ART ================= */
function iconSVG(key){
  const g=ICONS[key]||ICONS.BOLT; let sh="",fg="";
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){if(g[y][x]!=="x")continue; sh+=R(x+1,y+1); fg+=R(x,y);}
  return `<g fill="#0b0b0e">${sh}</g><g fill="currentColor">${fg}</g>`;
}
const RN=18;
function stationSVG(key){
  const c=(RN-1)/2, rO=RN/2-0.5, rI=rO-2.4;
  let ring="",shadow="",inner="";
  for(let y=0;y<RN;y++)for(let x=0;x<RN;x++){
    const d=Math.hypot(x-c,y-c);
    if(d<=rO&&d>=rI){ring+=R(x,y);shadow+=R(x+1,y+1);} else if(d<rI){inner+=R(x,y);}
  }
  let icon="";
  if(key){const g=ICONS[key];for(let y=0;y<8;y++)for(let x=0;x<8;x++) if(g[y][x]==="x") icon+=R(x+5,y+5);}
  return `<svg viewBox="0 0 ${RN+1} ${RN+1}" shape-rendering="crispEdges">
    <g fill="#0b0b0e">${shadow}</g><g fill="#1e1e26">${inner}</g>
    <g fill="currentColor">${ring}${icon}</g></svg>`;
}
/* a charge segment: a small solid node, as in Paral·lel */
function chargeSVG(){
  const N=10,c=(N-1)/2; let dot="",sh="";
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    if(Math.hypot(x-c,y-c)<=c-1){ dot+=R(x,y); sh+=R(x+1,y+1); }
  }
  return `<svg viewBox="0 0 ${N+1} ${N+1}" shape-rendering="crispEdges">
    <g fill="#0c0a16">${sh}</g><g fill="currentColor">${dot}</g></svg>`;
}
(function(){
  const g=ICONS.WARN; let r="";
  for(let y=0;y<8;y++)for(let x=0;x<8;x++) if(g[y][x]==="x") r+=R(x,y);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8" shape-rendering="crispEdges"><g fill="#6e1219">${r}</g></svg>`;
  document.documentElement.style.setProperty("--warn",`url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
})();


/* A chunky, stair-stepped arrow. A CSS border triangle has a smooth diagonal,
   which is the wrong medium here — this is drawn on the same 8x8 pixel grid the
   station glyphs use, so its edge steps like everything else. */
const ARROW_R=["xx......","xxxx....","xxxxxx..","xxxxxxxx",
               "xxxxxxxx","xxxxxx..","xxxx....","xx......"];
function arrowSVG(pointRight){
  const g=pointRight ? ARROW_R : ARROW_R.map(r=>r.split("").reverse().join(""));
  let out="";
  g.forEach((row,y)=>row.split("").forEach((c,x)=>{ if(c==="x") out+=R(x,y); }));
  return `<svg viewBox="0 0 8 8" shape-rendering="crispEdges">${out}</svg>`;
}
