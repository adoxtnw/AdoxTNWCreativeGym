"use strict";
/* NEURO-METRO: AVUI — MAP — the Mental Stamina / Emotional Charge bar
   ---------------------------------------------------------------------
   A VERBATIM PORT of the battle system's src/gauge.js. Not a lookalike: the
   same per-pixel renderer, reading the same constants out of the same rules
   sheet, so the bar in the pause menu and the bar in a fight are the same
   object rather than two things that have to be kept looking alike.

   Two changes, both forced by the move and neither cosmetic:

     - the accent came from `u === S.player`; there is no battle here, so the
       caller passes it in `o.accent`
     - `wave` is renamed `gwave`, because in the map every file shares one
       global scope and a second `wave` would be a SyntaxError that kills
       whichever file loads later

   Everything the renderer needs from a unit it reads off a plain object:
   {ms, ec, maxMs, shownMs, shownEc, hurtFlash}. `Player.gaugeUnit()` builds
   one. Re-declared rather than imported for the usual reason — the two apps
   are siblings, and only the DATA is shared.                              */

const GAUGE = {
  W:  RULES.gaugeW,  H:  RULES.gaugeH,
  core: RULES.barCoreH,
  mint: hexRGB("#b0ffe1"),          // the player's accent
  rose: hexRGB("#ffc2cd"),          // the enemy's
  crescent: [255,255,255],
  deadEdge: hexRGB("#70626a"),
  deadMid:  hexRGB("#000000"),
  deadRim:  hexRGB("#4d3643")
};

/* the six official hues, in sheet order — that order IS the gradient */
const EC_RAMP = Object.values(EMOTIONS).map(e => hexRGB(e.hex));
/* The ramp is a RING, not a line: after Fear it wraps back into Anger, so the
   gradient can scroll for ever without the hard seam a linear ramp leaves. */
function rampAt(t){
  const n = EC_RAMP.length;
  t = ((t % 1) + 1) % 1;
  const f = t * n, i = Math.floor(f), k = f - i;
  const a = EC_RAMP[i % n], b = EC_RAMP[(i + 1) % n];
  return [a[0]+(b[0]-a[0])*k, a[1]+(b[1]-a[1])*k, a[2]+(b[2]-a[2])*k];
}

let gaugePhase = 0;

const gwave = (x, amp, half, ph) => Math.sin((x / half + ph) * Math.PI) * amp;
/* Colour dodge: base / (1 - blend). Used to lay a second, half-thickness charge
   bar over the charge bar — same wave, same gradient — so the core of the fill
   blooms where the two overlap. */
const dodge1 = (b, s) => s >= 255 ? 255 : Math.min(255, (b * 255) / (255 - s));
const dodgeRGB = (base, blend) => [dodge1(base[0], blend[0]),
                                   dodge1(base[1], blend[1]),
                                   dodge1(base[2], blend[2])];

function drawGauge(ctx, dctx, u, o){
  const W = GAUGE.W, H = GAUGE.H;
  const accent = o.accent || GAUGE.mint;
  const img = ctx.createImageData(W, H), D = img.data;
  const dimg = dctx.createImageData(W, H), DD = dimg.data;
  const cy = H / 2;
  const capW = RULES.capW;
  const usable = W - capW * 2;                       // caps sit inside the ends
  const at = v => capW + Math.round((Math.max(0, Math.min(v, u.maxMs)) / u.maxMs) * usable);

  const showMs = u.shownMs != null ? u.shownMs : u.ms;
  const showEc = u.shownEc != null ? u.shownEc : u.ec;
  const msX  = at(showMs);
  const ecX  = at(Math.min(showEc, u.maxMs));
  const projX = (o.projMs != null && o.projMs < u.ms) ? at(o.projMs) : -1;
  const spendX = o.spend > 0 ? at(Math.max(0, u.ec - o.spend)) : -1;
  const chargeX = o.chargeTo > u.ec ? at(Math.min(o.chargeTo, u.maxMs)) : -1;
  const overcharged = showEc > showMs;

  const paintTo = (T) => (x, y, c, a) => {
    if(x < 0 || x >= W || y < 0 || y >= H) return;
    const o4 = (y * W + x) * 4, al = a == null ? 1 : a;
    T[o4]   = T[o4]  *(1-al) + c[0]*al;
    T[o4+1] = T[o4+1]*(1-al) + c[1]*al;
    T[o4+2] = T[o4+2]*(1-al) + c[2]*al;
    T[o4+3] = 255;
  };
  const put  = paintTo(D);      // the living bar — this canvas carries the glow
  const dead = paintTo(DD);     // spent capacity — deliberately unlit

  for(let x = 0; x < W; x++){
    const w  = gwave(x, RULES.barWaveAmp, RULES.barWaveHalf, gaugePhase * RULES.barWaveSpeed);
    const top = cy - GAUGE.core/2 - w;                // mirrored: the bar
    const bot = cy + GAUGE.core/2 + w;                // pinches and bulges
    const ecW = gwave(x, RULES.ecWaveAmp, RULES.ecWaveHalf, gaugePhase * RULES.ecWaveSpeed);
    const band = (GAUGE.core * RULES.ecBandFrac) / 2;

    for(let y = 0; y < H; y++){
      /* ---- destroyed capacity: a plain bordered box, per the reference.
             Charge that has spilled past the ceiling is drawn instead, so an
             overload is visible rather than buried under the dead region. ---- */
      if(x > msX + capW && !(overcharged && x <= ecX)){
        const half = GAUGE.core/2 + 1;
        const dy = Math.abs(y - cy);
        if(dy > half) continue;
        if(dy > half - 1 || x > W - 2){ dead(x, y, GAUGE.deadEdge); continue; }
        const k = dy / half;                       // plum at the rims, black mid
        dead(x, y, [GAUGE.deadMid[0]+(GAUGE.deadRim[0]-GAUGE.deadMid[0])*k,
                    GAUGE.deadMid[1]+(GAUGE.deadRim[1]-GAUGE.deadMid[1])*k,
                    GAUGE.deadMid[2]+(GAUGE.deadRim[2]-GAUGE.deadMid[2])*k]);
        continue;
      }
      /* The living bar lives strictly BETWEEN the two brackets. It used to be drawn
         underneath them as well, and because a cap has rounded corners the wave's
         peaks showed through exactly where those corner pixels are cut away — the
         silhouette appeared to poke out past the bracket. The one exception is
         charge that has spilled past the ceiling, which must still draw. */
      const underCap = x < capW || (x >= msX && x <= msX + capW);
      if(underCap && !(overcharged && x > msX && x <= ecX)) continue;

      if(y < top - 1 || y > bot + 1) continue;

      /* PAST THE CEILING THERE IS NO BAR, ONLY SPILL.

         Overcharge is allowed to draw beyond the stamina bracket — that is the
         whole point of showing it. But it was drawing the WHOLE bar out there:
         the mint silhouette top and bottom, and the dark stamina interior
         between them. The bracket stopped reading as the end of the bar and
         the wave appeared to burst straight out of it.

         Only the charge band belongs past the ceiling. Without the outline and
         the unlit fill, the bracket stays the end of the stamina and the
         overload reads as something escaping it. */
      const beyondCeiling = overcharged && x > msX;

      /* ---- the mint silhouette stroke ---- */
      if(!beyondCeiling && (y <= top + 0.6 || y >= bot - 0.6)){ put(x, y, accent); continue; }

      /* ---- interior ---- */
      const dy = Math.abs(y - (cy + ecW));
      const inBand = dy <= band;
      if(x <= ecX && inBand){
        if(overcharged && x > msX){
          const pulse = 0.5 + 0.5*Math.sin(gaugePhase*0.5);
          put(x, y, [255, 120 + 110*pulse, 40]);
        } else {
          let c = rampAt(x / W - gaugePhase * RULES.ecScrollSpeed);
          /* the inner bar: same shape, same gradient, half as thick, dodged on
             top of the outer one */
          if(dy <= band * RULES.ecInnerFrac) c = dodgeRGB(c, c.map(v => v * RULES.ecInnerAmt));
          put(x, y, c);
        }   // fixed to the bar and revealed by the fill, but always drifting
        continue;
      }
      /* there is no unlit STAMINA past the stamina ceiling — see above */
      if(beyondCeiling) continue;
      /* unlit stamina: dark, with the arc texture only readable here */
      put(x, y, [10, 9, 8]);
      if(x > ecX && x < msX){
        const R = RULES.arcRadius, dy = y - cy;
        const back = Math.sqrt(Math.max(0, R*R - dy*dy));
        const m = (x - back) / RULES.arcSpacing;   // which arc passes through here
        if(Math.abs(m - Math.round(m)) < 0.16)
          put(x, y, accent, RULES.arcAlpha);
      }
    }

    /* ---- previews ride the charge band ---- */
    if(spendX >= 0 && x > spendX && x <= ecX){
      const f = 0.5 + 0.5*Math.sin(gaugePhase*0.9);
      for(let y = Math.ceil(cy+ecW-band); y <= cy+ecW+band; y++)
        put(x, y, [255*f, 255*f, 255*f], 0.8);
    }
    if(chargeX >= 0 && x > ecX && x <= chargeX){
      for(let y = Math.ceil(cy+ecW-band); y <= cy+ecW+band; y++)
        put(x, y, hexRGB(EMOTIONS.SURPRISE.hex), 0.75);
    }
  }

  /* ---- the charge's leading edge: the reference's white crescent ---- */
  if(ecX > capW){
    for(let y = 0; y < H; y++){
      const ecW = gwave(ecX, RULES.ecWaveAmp, RULES.ecWaveHalf, gaugePhase*RULES.ecWaveSpeed);
      const band = (GAUGE.core * RULES.ecBandFrac) / 2;
      const dy = (y - (cy + ecW)) / band;
      if(Math.abs(dy) > 1) continue;
      const bulge = Math.round(Math.sqrt(1 - dy*dy) * 2);   // rounded, not flat
      for(let k = 0; k <= bulge; k++) put(ecX - 1 + k, y, GAUGE.crescent);
    }
  }

  /* ---- end caps: zero, and the stamina ceiling ---- */
  const cap = (cxp, hurt) => {
    const r = RULES.capR, h = H - 2;
    for(let x = cxp; x < cxp + capW; x++)
      for(let y = 1; y < 1 + h; y++){
        const ex = Math.min(x - cxp, cxp + capW - 1 - x);
        const ey = Math.min(y - 1, h - (y - 1) - 1);
        if(ex < r && ey < r && (r-ex)*(r-ex) + (r-ey)*(r-ey) > r*r + 1) continue;
        put(x, y, hurt ? [255,255,255] : accent);
      }
  };
  cap(0, false);
  cap(Math.min(msX, W - capW), u.hurtFlash > 0);

  if(projX >= 0) for(let y = 2; y < H - 2; y++) put(projX, y, hexRGB(EMOTIONS.ANGER.hex));

  ctx.putImageData(img, 0, 0);
  dctx.putImageData(dimg, 0, 0);
}
