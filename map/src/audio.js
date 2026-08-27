"use strict";
/* NEURO-METRO: AVUI — MAP — audio
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   RE-DECLARED, NOT IMPORTED. The battle system has its own copy of this graph.
   The two apps are siblings, and reaching across into `../BATTLE SYSTEM/src/`
   is the coupling the workspace split exists to prevent. What the two DO share
   is the part that matters — the `sounds` sheet — so a sound is defined once
   even though the synth that plays it is built twice.

   Nothing here is an audio file: every effect is a swept oscillator (or noise)
   through a bit-crusher, which is where the crunch comes from. The music is
   the exception in every sense — it is a real recording, and it does not touch
   this graph at all. See MUSIC below for why.                               */

let actx = null, master = null, sfxBus = null, delay = null, noiseBuf = null;

function crushCurve(steps){
  const n = 1024, c = new Float32Array(n);
  for(let i = 0; i < n; i++){ const x = i / (n - 1) * 2 - 1; c[i] = Math.round(x * steps) / steps; }
  return c;
}
function initAudio(){
  if(actx) return;
  const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
  actx = new AC();
  master = actx.createGain(); master.gain.value = 0.7;
  sfxBus = actx.createGain(); sfxBus.gain.value = (RULES && RULES.sfxVolume) || 0.7;
  sfxBus.connect(master);
  const crusher = actx.createWaveShaper();
  crusher.curve = crushCurve((RULES && RULES.crusherSteps) || 12); crusher.oversample = "none";
  const lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 7200;
  delay = actx.createDelay(1.0); delay.delayTime.value = 0.115;
  const fb = actx.createGain(); fb.gain.value = 0.40;
  delay.connect(fb); fb.connect(delay);
  const dOut = actx.createGain(); dOut.gain.value = 0.75;
  delay.connect(dOut); dOut.connect(crusher);
  master.connect(crusher); crusher.connect(lp); lp.connect(actx.destination);
  const len = actx.sampleRate * 1.2;
  noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for(let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}
/* Browsers refuse to start audio until the user has touched something, so every
   entry point resumes rather than assuming. */
function audioReady(){
  initAudio(); if(!actx) return false;
  if(actx.state === "suspended") actx.resume();
  return true;
}
function sfx(id, mult){
  const s = SOUNDS[id]; if(!s || !audioReady()) return;
  const t0 = actx.currentTime, dur = s.dur / 1000, m = mult || 1;
  let src;
  if(s.wave === "noise"){
    src = actx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    src.playbackRate.value = Math.max(0.05, s.f0 / 700 * m);
  }else{
    src = actx.createOscillator(); src.type = s.wave;
    src.frequency.setValueAtTime(Math.max(20, s.f0 * m), t0);
    src.frequency.exponentialRampToValueAtTime(Math.max(20, s.f1 * m), t0 + dur);
  }
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(s.gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(g); g.connect(sfxBus);
  if(s.echo > 0){ const e = actx.createGain(); e.gain.value = s.echo; g.connect(e); e.connect(delay); }
  src.start(t0); src.stop(t0 + dur + 0.05);
}

/* ============================== MUSIC ======================================
   Two tracks, and silence is the third state.

     MAP      Rise               the network, the menus, standing on a platform
     RIDE     Jump to win        the moment the wipe opens until the flood of white
     none     the arrival card   a station is quiet; only the interface makes noise

   HOW A CHANGE SOUNDS. The outgoing track fades out FAST while the incoming one
   starts at full volume immediately — no fade in, no gap. Crossing at full
   level is what makes a cut feel like a cut; fading up the new one would turn
   every transition into a smear, and waiting for the old one to finish would
   leave a hole exactly where the game wants momentum.

   THE FILES ARE CONVERTED, NOT THE ORIGINALS. `AVUI/MUSIC/` keeps what was
   handed over; `MAP/audio/` holds web-ready AAC, which is what ships. The same
   split as the spreadsheet and `data.js`: a source you edit, an artefact you
   upload. Rise alone was 25 MB as WAV, which is not a thing to send down a
   phone connection.

   NOTHING PLAYS UNTIL THE PLAYER TOUCHES THE SCREEN. Browsers refuse audio
   before a gesture, so the first tap anywhere starts whatever should be
   playing — see `armMusic()`.                                                */

const TRACKS = {
  MAP : {src: "audio/rise.m4a", gain: 0.55, loop: true},
  RIDE: {src: "audio/ride.m4a", gain: 0.60, loop: true}
};
const FADE_OUT_MS = 380;          /* quick: a cut, not a dissolve */
/* EXCEPT WHEN LEAVING A STATION. Every other change of music is a cut, because
   a cut is what makes a change of place feel abrupt and deliberate. Departure
   is the one moment that is meant to feel long: the map drains, the camera
   falls into the station, and the two tracks trade places across the whole of
   it. Passed in per call rather than decided in here, so this file still knows
   nothing about phases. */

/* NOT THROUGH THE WEB AUDIO GRAPH, DELIBERATELY. Routing a media element
   through `createMediaElementSource` makes it subject to a CORS check, and a
   failed check does not throw — the graph simply outputs SILENCE. On file://
   every origin is opaque, so that check can never pass and the music is
   guaranteed silent while every synthesised effect keeps working, which is a
   miserable thing to debug. The graph was only ever there to hold a gain node
   for fading, and `<audio>.volume` does that with none of the risk. */
const Music = {
  want: null,          /* what SHOULD be playing */
  cur: null,           /* what IS playing */
  armed: false,        /* has a gesture unlocked audio yet */
  _els: {},            /* id -> HTMLAudioElement */
  _fades: {},          /* id -> interval handle */

  /* Ask for a track (or null for silence). Idempotent: calling it every frame
     with the same answer does nothing, which is what lets the phase table below
     simply state what should be true. */
  set(id, opt){
    if(this.want === id && !this.stalled()) return;
    this.want = id;
    this.opt = opt || null;          /* {inMs, outMs}: how THIS change sounds */
    if(this.armed) this.apply();
  },
  opt: null,
  /* IS WHAT WE ASKED FOR ACTUALLY SOUNDING? A track can be left paused by a
     fade that was scheduled and then immediately re-requested, and the plain
     `cur === want` check would then agree that it is playing while the game sat
     in silence. Cheap to ask, and it turns a dead-air bug into a non-event. */
  stalled(){
    if(!this.cur) return false;
    const el = this._els[this.cur];
    return !!el && (el.paused || el.volume < 0.01);
  },
  apply(){
    if(this.cur === this.want && !this.stalled()) return;
    const o = this.opt || {};
    if(this.cur && this.cur !== this.want) this.fade(this.cur, o.outMs || FADE_OUT_MS);
    const id = this.want;
    this.cur = id;
    if(!id) return;
    const el = this.el(id); if(!el) return;
    clearInterval(this._fades[id]);              /* cancel a fade in progress */
    if(o.inMs > 0) this.ramp(id, 0, TRACKS[id].gain, o.inMs);
    else el.volume = TRACKS[id].gain;            /* abrupt, at full */
    try{ el.currentTime = 0; }catch(e){}
    const p = el.play();
    /* A rejected play() means the gesture did not count after all. Disarm so
       the next tap tries again rather than leaving the map permanently mute. */
    if(p && p.catch) p.catch(() => { this.armed = false; this.cur = null; });
  },
  fade(id, ms){ this.ramp(id, this._els[id] && this._els[id].volume, 0, ms, true); },
  /* One ramp, both directions. `pauseAtEnd` is what makes a fade out actually
     stop the track rather than leave it running silently — and it happens only
     when the ramp completes, so a fade that is overtaken by a new request never
     pauses the thing that request just started. */
  ramp(id, from, to, ms, pauseAtEnd){
    const el = this._els[id]; if(!el) return;
    clearInterval(this._fades[id]);
    if(from == null) from = el.volume;
    const steps = Math.max(1, Math.round(ms / 25));
    let i = 0;
    el.volume = Math.max(0, Math.min(1, from));
    this._fades[id] = setInterval(() => {
      i++;
      const k = Math.min(1, i / steps);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if(i >= steps){
        clearInterval(this._fades[id]);
        if(pauseAtEnd){ try{ el.pause(); }catch(e){} }
      }
    }, 25);
  },
  el(id){
    if(this._els[id]) return this._els[id];
    const t = TRACKS[id]; if(!t) return null;
    const el = new Audio(t.src);
    /* no crossOrigin: see the note above — it buys nothing and can only mute */
    el.loop = !!t.loop; el.preload = "auto"; el.volume = 0;
    return (this._els[id] = el);
  },
  /* The first gesture anywhere unlocks audio and starts whatever is wanted.
     Called on EVERY pointerdown, not just the first, so a play() the browser
     refused earlier gets another go. */
  arm(){
    if(this.armed && !this.stalled()) return;
    this.armed = true;
    if(this.cur === this.want) this.cur = null;   /* force apply() to act */
    this.apply();
  }
};

/* WHAT SHOULD BE PLAYING, stated as a fact about the phase rather than as a
   pile of start/stop calls scattered through the journey. Called whenever the
   HUD syncs, so there is one place to read and one place to change. */
function musicForPhase(){
  const p = J.phase;
  /* the long one: the ride's theme rises through the zoom while the map's
     drains away under it, both finishing as the wipe opens */
  if(p === "ZOOM"){
    const ms = Math.max(400, num(RULES.departSecs, 3) * 1000);
    return Music.set("RIDE", {inMs: ms, outMs: ms});
  }
  /* ENCOUNTER IS NOT IN THIS LIST, AND THAT MATTERS. It used to be — back when
     an encounter was a debug panel over a paused ride, and the ride's theme
     carrying on underneath was right. It is a real fight now, with its own
     music, and because this branch is tested FIRST a stale entry here silently
     beat the silence rule below: the table said two contradictory things and
     the earlier one won. */
  if(p === "RIDING" || p === "ANNOUNCE" || p === "WIPE_IN")
    return Music.set("RIDE");
  /* FLASH is the white flooding in; by the time the card lands it is silent.
     ENCOUNTER and its flood belong to the battle system, which brings its own
     theme — two pieces of music over each other is the one thing worse than
     silence. The ride's comes back abruptly at full on the way out, which is
     already how every other return to this app's music works. */
  if(p === "FLASH" || p === "BANNER" || p === "DILEMMA" || p === "BOSSWAIT" ||
     p === "ENCOUNTER" || p === "ENCOUNTER_IN")
    return Music.set(null);
  Music.set("MAP");
}
/* Kept so older calls do not break; both now go through the table above. */
function musicStart(){ musicForPhase(); }
function musicFadeOut(){ Music.set(null); }
