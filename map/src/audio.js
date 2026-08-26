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

   Nothing is an audio file: every effect is a swept oscillator (or noise)
   through a bit-crusher, which is where the crunch comes from. The one
   exception is the music, which is a real recording and therefore bypasses the
   crusher entirely — see MUSIC below.                                       */

let actx = null, master = null, sfxBus = null, cleanBus = null,
    delay = null, noiseBuf = null;

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
  /* A CLEAN bus, straight out, for anything already recorded. The crusher and
     the 7.2 kHz lowpass exist to make SYNTHESISED effects crunchy; run a real
     mix through them and they do nothing but damage it. */
  cleanBus = actx.createGain(); cleanBus.gain.value = 0.7;
  cleanBus.connect(actx.destination);
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

const Music = {
  want: null,          /* what SHOULD be playing */
  cur: null,           /* what IS playing */
  armed: false,        /* has a gesture unlocked audio yet */
  _nodes: {},          /* id -> {el, src, gain} */

  /* Ask for a track (or null for silence). Idempotent: calling it every frame
     with the same answer does nothing, which is what lets the phase table below
     simply state what should be true. */
  set(id){
    if(this.want === id && !this.stalled()) return;
    this.want = id;
    if(this.armed) this.apply();
  },
  /* IS WHAT WE ASKED FOR ACTUALLY SOUNDING? A track can be left paused by a
     fade that was scheduled and then immediately re-requested, and the plain
     `cur === want` check would then agree that it is playing while the game sat
     in silence. Cheap to ask, and it turns a dead-air bug into a non-event. */
  stalled(){
    if(!this.cur) return false;
    const n = this._nodes[this.cur];
    return !!n && (n.el.paused || n.gain.gain.value < 0.01);
  },
  apply(){
    if(this.cur === this.want && !this.stalled()) return;
    if(this.cur && this.cur !== this.want) this.fade(this.cur, FADE_OUT_MS);
    const id = this.want;
    this.cur = id;
    if(!id) return;
    const n = this.node(id);
    if(!n) return;
    const t = actx.currentTime;
    clearTimeout(n.stopAt);                      /* cancel a pending pause */
    n.gain.gain.cancelScheduledValues(t);
    /* both: `.value` snaps it now, `setValueAtTime` anchors the automation
       curve so a later ramp starts from full rather than from wherever the
       previous fade had got to */
    n.gain.gain.value = TRACKS[id].gain;
    n.gain.gain.setValueAtTime(TRACKS[id].gain, t);   /* abrupt, at full */
    try{ n.el.currentTime = 0; }catch(e){}
    const p = n.el.play(); if(p && p.catch) p.catch(() => {});
  },
  fade(id, ms){
    const n = this._nodes[id]; if(!n || !actx) return;
    const t = actx.currentTime;
    n.gain.gain.cancelScheduledValues(t);
    n.gain.gain.setValueAtTime(Math.max(0.0001, n.gain.gain.value), t);
    n.gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    /* pause only after the ramp, or the fade is a cut */
    clearTimeout(n.stopAt);
    n.stopAt = setTimeout(() => { try{ n.el.pause(); }catch(e){} }, ms + 60);
  },
  node(id){
    if(this._nodes[id]) return this._nodes[id];
    if(!audioReady()) return null;
    const t = TRACKS[id]; if(!t) return null;
    const el = new Audio(t.src);
    el.loop = !!t.loop; el.preload = "auto"; el.crossOrigin = "anonymous";
    let src;
    try{ src = actx.createMediaElementSource(el); }
    catch(e){ return null; }
    const gain = actx.createGain();
    gain.gain.value = 0.0001;
    src.connect(gain); gain.connect(cleanBus);   /* clean: never bit-crushed */
    return (this._nodes[id] = {el, src, gain, stopAt: 0});
  },
  /* The first gesture anywhere unlocks audio and starts whatever is wanted. */
  arm(){
    if(this.armed) return;
    if(!audioReady()) return;
    this.armed = true;
    const w = this.want; this.cur = null; this.want = w;
    this.apply();
  }
};

/* WHAT SHOULD BE PLAYING, stated as a fact about the phase rather than as a
   pile of start/stop calls scattered through the journey. Called whenever the
   HUD syncs, so there is one place to read and one place to change. */
function musicForPhase(){
  const p = J.phase;
  if(p === "RIDING" || p === "ANNOUNCE" || p === "ENCOUNTER" || p === "WIPE_IN")
    return Music.set("RIDE");
  /* FLASH is the white flooding in; by the time the card lands it is silent */
  if(p === "FLASH" || p === "BANNER" || p === "DILEMMA" || p === "BOSSWAIT")
    return Music.set(null);
  Music.set("MAP");
}
/* Kept so older calls do not break; both now go through the table above. */
function musicStart(){ musicForPhase(); }
function musicFadeOut(){ Music.set(null); }
