"use strict";
/* NEURO-METRO: AVUI — ability kinds
   ---------------------------------------------------------------------
   Every ability has a `kind` column in the spreadsheet. This is the registry
   that gives each kind behaviour. Adding a kind is adding one define() call
   here plus rows in the sheet — nothing in battle.js changes.

   Each kind declares two things, and BOTH matter:

     project({A,D,ab})   pure, synchronous, no DOM. Applies the ability to a
                         scratch copy of the actor (A) and defender (D). This
                         is what the build-phase preview and the enemy AI read.
                         A kind without a projection is invisible to both — the
                         bug this registry exists to make impossible.

     run(ctx)            the live effect. May await, animate, play sound.
                         ctx = {actor, target, ab, onEnemy, stationEl}

   The scratch objects are {ms, ec, shield, layers:[emotionId]} — plain data,
   never the real units.                                                     */

const Kinds = (() => {
  const reg = {};
  return {
    define(id, spec){
      reg[id] = Object.assign({ id, project(){}, async run(){} }, spec);
    },
    get(id){
      const k = reg[id];
      if(!k) console.warn(`unknown ability kind "${id}" — treated as inert`);
      return k || reg.__inert;
    },
    ids(){ return Object.keys(reg).filter(k => k[0] !== "_"); }
  };
})();
Kinds.define("__inert", {});

/* ---------- DAMAGE: the ordinary attack ---------- */
Kinds.define("DAMAGE", {
  project({A, D, ab}){
    if(D.shield > 0){ D.shield--; return; }
    const m = matchup(D.layers[0] || null, ab.emotion);
    const dealt = Math.min(Math.round(ab.power * m.dmg), D.ms);
    D.ms -= dealt;
    D.ec += ecFrom(ab, dealt, m);
    if(ab.hits_layer && D.layers.length) D.layers.shift();   // gone for the round
  },
  async run({actor, target, ab, onEnemy, stationEl}){
    const targetEl = onEnemy ? document.querySelector(".sprwrap") : $("pstrip");
    if(stationEl) await flyStrike(stationEl, targetEl, emoHex(ab.emotion));

    if(target.shield > 0){
      target.shield -= 1;
      bigTag("BLOCKED", "block"); sfx("block"); shieldBreak(targetEl);
      if(RULES.shieldRotatesLayer && ab.hits_layer) await breakLayer(target);
      renderStats(); await sleep(380); return;
    }

    /* Blinded by Hate and anything else carrying miss_chance: the swing is taken
       and simply misses. Rolled here, in run(), NOT in project() — a preview that
       gambled would show the player a number the game then contradicts. */
    if(Math.random() < missChance(actor)){
      bigTag("MISS", "off"); sfx("block");
      renderStats(); await sleep(420); return;
    }

    const lay = target.layers[0] || null;
    const resisted = !!(lay && ab.emotion && lay.e === ab.emotion);
    const m = matchup(lay ? lay.e : null, ab.emotion);
    /* Rolled HERE and never in project(): the build-phase preview has to stay
       deterministic, or it would promise a number the game then contradicts. */
    const odds = (ab.crit_chance === "" || ab.crit_chance == null ? RULES.critChance : ab.crit_chance)
                 + critBonus(actor);
    const crit = Math.random() < odds;
    const dealt = Math.min(Math.round(ab.power * m.dmg * (crit ? RULES.critMult : 1)), target.ms);
    const gain = ecFrom(ab, dealt, m);
    target.ms -= dealt; target.ec += gain;
    queueDelta(target, "MS", -dealt);          // the bar moves at settlement,
    if(gain > 0) queueDelta(target, "EC", gain);   // not here

    /* No damage number and no matchup label: the accumulating MS/EC tags carry
       that information now, and the pair of them was too much to read at once.
       The matchup still speaks through its sound. */
    if(resisted) resistTag(lay.e);
    else {
      AbilityFx.play("hit", {ab, actor, target, matchup:m, crit});
      /* A critical earns whoever landed it one extra slot on their next line, and
         the whole beat is AWAITED — the tag holds, the screen flashes, the slot
         flies into the line, and only then does the next station fire. */
      if(crit) await criticalSequence(actor, target, ab.emotion);
    }
    checkDialogue();
    await Hooks.emit("damage:dealt", {attacker:actor, defender:target, ability:ab, amount:dealt, matchup:m});
    await impact(onEnemy);

    if(target.ms <= 0){ await settleAll(); await clashSequence(target === S.player); return; }
    /* A layer of the SAME emotion shrugs the hit off: it still costs stamina, but
       the layer survives. Tested on the emotions directly rather than through the
       matchup label, because that is the rule as stated — like does not break like. */
    if(ab.hits_layer && !resisted) await breakLayer(target);
  }
});

/* ---------- SHIELD: absorb the next hit ---------- */
Kinds.define("SHIELD", {
  project({A, ab}){ A.shield += ab.power; },
  async run({actor, ab}){
    actor.shield += ab.power;
    AbilityFx.play("hit", {ab, actor, target:actor});
    bigTag("SHIELD UP", "block"); sfx("block");
    renderStats(); await sleep(380);          // shields are not a bar value
  }
});

/* ---------- CHARGE: buy Emotional Charge with your own Mental Stamina ---------- */
Kinds.define("CHARGE", {
  project({A, ab}){
    A.ms -= Math.min(ab.self_ms || 0, Math.max(0, A.ms - 1));
    A.ec += ab.power;
  },
  async run({actor, ab, onEnemy}){
    const burn = Math.min(ab.self_ms || 0, Math.max(0, actor.ms - 1));   // never self-kill
    actor.ms -= burn; actor.ec += ab.power;
    queueDelta(actor, "EC", ab.power);
    if(burn > 0) queueDelta(actor, "MS", -burn);
    AbilityFx.play("hit", {ab, actor, target:actor});
    sfx("absorb");
    checkDialogue();
    await sleep(420);
  }
});

/* ---------- SELFHARM: forced into the line by Overload ---------- */
Kinds.define("SELFHARM", {
  project({A, ab}){ A.ms -= Math.min(ab.power, A.ms); },
  async run({actor, ab, onEnemy, stationEl}){
    /* It starts as an attack — the symbol goes for the opponent and turns back. */
    const away = onEnemy ? $("pstrip") : document.querySelector(".sprwrap");
    const home = onEnemy ? document.querySelector(".sprwrap") : $("pstrip");
    if(stationEl) await boomerangStrike(stationEl, away, home, emoHex(ab.emotion));
    const dealt = Math.min(ab.power, actor.ms);
    actor.ms -= dealt;
    queueDelta(actor, "MS", -dealt);
    AbilityFx.play("hit", {ab, actor, target:actor});
    unitTag(actor, "SELF HARM", emoHex(ab.emotion)); sfx("hit");
    await impact(!onEnemy);
    if(actor.ms <= 0){ await settleAll(); await clashSequence(actor === S.player); }
  }
});

/* ---------- FEED: forced into the line by Overload; heals the opponent ---------- */
Kinds.define("FEED", {
  project({D, ab}){ D.ms = Math.min(D.msMax ?? Infinity, D.ms + ab.power); },
  async run({target, ab}){
    const healed = Math.min(ab.power, target.maxMs - target.ms);
    target.ms += healed;
    queueDelta(target, "MS", healed);
    AbilityFx.play("hit", {ab, actor:target, target});
    unitTag(target, "HEALED", "#b0ffe1"); sfx("regrow");
    await sleep(520);
  }
});

/* ---------- ADDLAYER: grow yourself another layer ----------
   Grown layers are TEMPORARY (`temp`): breakLayer never files them into `broken`,
   so once they are gone they never come back. */
Kinds.define("ADDLAYER", {
  project({A, ab}){ for(let i = 0; i < (ab.power || 1); i++) A.layers.push(ab.emotion); },
  async run({actor, ab}){
    const n = ab.power || 1;
    for(let i = 0; i < n; i++)
      actor.layers.push({e: ab.emotion, pos: actor.layers.length, flash: 0, temp: true});
    actor.layers.forEach((l, i) => { l.pos = i; });
    AbilityFx.play("hit", {ab, actor, target:actor});
    bigTag("+" + n + " LAYER", "block"); sfx("regrow");
    renderStats(); await sleep(460);
  }
});

/* ---------- DEBUFF: hang a status on the target ---------- */
Kinds.define("DEBUFF", {
  /* No ms/ec movement, so the AI values it at zero — deliberate for now. Give it
     a heuristic here if the enemy should ever learn to use debuffs well. */
  project(){},
  async run({actor, target, ab, onEnemy}){
    const st = applyStatus(target, ab.status_apply, ab.status_duration, ab.name);
    if(!st){ return; }
    AbilityFx.play("apply", {ab, actor, target, st});
    renderStats();
    await sleep(RULES.statusFxMs);
  }
});
