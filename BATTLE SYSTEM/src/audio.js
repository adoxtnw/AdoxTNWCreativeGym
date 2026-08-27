"use strict";
/* NEURO-METRO: AVUI — audio graph, sound effects, theme
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */

/* ================= AUDIO — synthesised, crunchy, echoing ================= */
let actx=null, master=null, sfxBus=null, cleanBus=null, delay=null, noiseBuf=null;
function crushCurve(steps){
  const n=1024, c=new Float32Array(n);
  for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; c[i]=Math.round(x*steps)/steps; }
  return c;
}
function initAudio(){
  if(actx) return;
  const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
  actx=new AC();
  master=actx.createGain(); master.gain.value=0.7;
  sfxBus=actx.createGain(); sfxBus.gain.value=RULES.sfxVolume; sfxBus.connect(master);
  const crusher=actx.createWaveShaper();          // lo-fi quantisation = the crunch
  crusher.curve=crushCurve(RULES.crusherSteps||12); crusher.oversample="none";
  const lp=actx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=7200;
  delay=actx.createDelay(1.0); delay.delayTime.value=0.115;
  const fb=actx.createGain(); fb.gain.value=0.40;   // repeats = the echo
  delay.connect(fb); fb.connect(delay);
  const dOut=actx.createGain(); dOut.gain.value=0.75;
  delay.connect(dOut); dOut.connect(crusher);
  master.connect(crusher); crusher.connect(lp); lp.connect(actx.destination);
  /* A CLEAN bus, straight out, for anything already recorded.
     The crusher and the 7.2 kHz lowpass exist to make the SYNTHESISED effects
     crunchy. While the theme was a MIDI played on square waves that was fine —
     squares already sit at the quantiser's extremes, so crushing them was very
     nearly a no-op. A recorded mix is not: measured, the same chain collapsed the
     theme from ~52,900 distinct sample levels to ~780 (about 2-3 bits, because at
     0.3 x 0.7 it only spans ~2.5 of the quantiser's 12 steps), multiplied its
     high-frequency energy by 5.6 as aliasing, and then the lowpass removed half
     of what was genuinely up there. Same gain as `master`, so the level is
     unchanged — only the damage is gone. */
  /* UNITY, so `musicVolume` is the only thing setting the music's level.
     Nothing but the theme goes through here, so this 0.7 was a second, hidden
     attenuation on top of the sheet's number — the theme was playing at
     0.30 x 0.7 = 0.21 while the sheet said 0.30, which is most of why it sat
     nine decibels under the map's. One gain, one place, one number. */
  cleanBus=actx.createGain(); cleanBus.gain.value=1.0;
  cleanBus.connect(actx.destination);
  const len=actx.sampleRate*1.2;
  noiseBuf=actx.createBuffer(1,len,actx.sampleRate);
  const d=noiseBuf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
}
/* each consecutive charge segment ticks a step higher than the one before */
function chargeTone(step){
  const base=SOUNDS.arrive; if(!base) return;
  sfxAt(base, Math.pow(1.20, step));
}
function sfx(id){
  const s=SOUNDS[id]; if(!s) return;
  initAudio(); if(!actx) return;
  if(actx.state==="suspended") actx.resume();
  sfxAt(s,1);
}
function sfxAt(s,mult){
  initAudio(); if(!actx) return;
  if(actx.state==="suspended") actx.resume();
  const t0=actx.currentTime, dur=s.dur/1000;
  let src;
  if(s.wave==="noise"){
    src=actx.createBufferSource(); src.buffer=noiseBuf; src.loop=true;
    src.playbackRate.value=Math.max(0.05,s.f0/700*mult);
  }else{
    src=actx.createOscillator(); src.type=s.wave;
    src.frequency.setValueAtTime(Math.max(20,s.f0*mult),t0);
    src.frequency.exponentialRampToValueAtTime(Math.max(20,s.f1*mult),t0+dur);
  }
  const g=actx.createGain();
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.exponentialRampToValueAtTime(s.gain,t0+0.008);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  src.connect(g); g.connect(sfxBus);
  if(s.echo>0){ const e=actx.createGain(); e.gain.value=s.echo; g.connect(e); e.connect(delay); }
  src.start(t0); src.stop(t0+dur+0.05);
}
/* ---------------- music: the theme, played by the same synth ---------------- */
let musicBus=null, musicOn=false, musicStart=0, musicIdx=[], musicTimer=null;
const midiHz = n => 440*Math.pow(2,(n-69)/12);
function playNote(tr,when,dur,n,v){
  let src;
  if(tr.wave==="noise"){
    src=actx.createBufferSource(); src.buffer=noiseBuf; src.loop=true;
    src.playbackRate.value=Math.max(0.15,Math.min(5,midiHz(n)/240));
    dur=Math.min(dur,0.09);
  }else{
    src=actx.createOscillator(); src.type=tr.wave; src.frequency.value=midiHz(n);
  }
  const g=actx.createGain(), peak=Math.max(0.001,tr.gain*v);
  g.gain.setValueAtTime(0.0001,when);
  g.gain.exponentialRampToValueAtTime(peak,when+0.012);
  g.gain.setValueAtTime(peak,when+Math.max(0.03,dur*0.7));
  g.gain.exponentialRampToValueAtTime(0.0001,when+dur+0.06);
  src.connect(g); g.connect(musicBus);
  src.start(when); src.stop(when+dur+0.09);
}
/* ================= THEME =================
   Two files, not one: an opening that plays once and a body that loops. The
   handoff must be seamless, so both are decoded to PCM up front and the loop is
   SCHEDULED on the audio clock at exactly `t0 + opening.duration`. That is
   sample-accurate — an `ended` handler or a timer would leave an audible seam.

   fetch() is blocked on file://, so when decoding fails we fall back to plain
   <audio> elements. Those cannot be gapless, but the prototype still has music
   when opened straight from disk. */
let musicBufs=null, musicLoad=null, musicSrcs=[], musicEls=[];

function loadMusic(){
  if(musicLoad) return musicLoad;
  const get = url => fetch(url).then(r=>{ if(!r.ok) throw new Error(url); return r.arrayBuffer(); })
                               .then(b=>actx.decodeAudioData(b));
  musicLoad = Promise.all([get(RULES.themeOpening), get(RULES.themeLoop)])
    .then(([opening, loop]) => (musicBufs = {opening, loop}))
    .catch(() => null);
  return musicLoad;
}

/* file:// fallback — audible seam at the handoff, but it plays. */
function startMusicEls(){
  const a=new Audio(RULES.themeOpening), b=new Audio(RULES.themeLoop);
  /* Element volume is restricted to 0..1; the Web Audio gain may exceed 1. */
  a.volume=b.volume=Math.max(0,Math.min(1,RULES.musicVolume)); b.loop=true; b.preload="auto";
  a.addEventListener("ended",()=>{ if(musicOn) b.play().catch(()=>{}); });
  a.play().catch(()=>{});
  musicEls=[a,b];
}

async function startMusic(){
  initAudio(); if(!actx||musicOn) return;
  /* A REFUSED RESUME MUST NOT COUNT AS PLAYING. This used to fall through and
     set `musicOn` regardless, so a browser that blocked the first attempt made
     every later one a no-op — the flag said the music was already on while the
     context sat suspended and silent. Now a refusal leaves everything untouched
     and the next attempt is a real attempt. */
  if(actx.state==="suspended"){
    try{ await actx.resume(); }catch(_){}
    if(actx.state==="suspended"){
      console.warn("audio is blocked by this browser; the theme will start on the first touch");
      return;
    }
  }
  musicBus=actx.createGain(); musicBus.gain.value=RULES.musicVolume;
  musicBus.connect(cleanBus);          // recorded audio bypasses the crusher
  musicOn=true;
  const bufs=await loadMusic();
  if(!musicOn) return;                       // stopped while it was still decoding
  if(!bufs){ startMusicEls(); return; }
  const t0=actx.currentTime + 0.08;
  const open=actx.createBufferSource();
  open.buffer=bufs.opening; open.connect(musicBus); open.start(t0);
  const loop=actx.createBufferSource();
  loop.buffer=bufs.loop; loop.loop=true; loop.connect(musicBus);
  loop.start(t0 + bufs.opening.duration);    // the seam, placed on the audio clock
  musicSrcs=[open, loop];
}

/* The graph — context, buses, crusher curve and the noise buffer — is built
   while the title screen is up, so CONFRONT EMOTION only has to resume it and
   the theme starts on the tap rather than after it. The context begins
   suspended, which is exactly what browsers require before a gesture. */
initAudio();
/* Decode the theme while the handoff frame is loading. `startMusic()` still owns
   playback; this only removes network/decoder latency from the opening. */
if(actx && /(?:\?|&)handoff=1(?:&|$)/.test(location.search)) loadMusic();
window.addEventListener("pointerdown",initAudio,{once:true});
/* A CONTEXT THAT WAS REFUSED CAN BE WOKEN LATER, and the music does not have to
   be restarted to hear it: while a context is suspended its clock does not
   advance, so sources already scheduled simply begin when it resumes. That
   matters because `startMusic()` marks the music as playing whether or not the
   resume was allowed — so without this, a refusal was permanent. */
function audioAwake(){
  if(actx && actx.state === "suspended"){ try{ actx.resume(); }catch(_){} }
}
function stopMusic(fadeMs){
  if(!musicOn) return;
  musicOn=false;
  if(musicTimer){ clearInterval(musicTimer); musicTimer=null; }
  musicEls.forEach(el=>{ try{ el.pause(); }catch(_){} }); musicEls=[];
  const kill=musicSrcs; musicSrcs=[];
  setTimeout(()=>kill.forEach(sr=>{ try{ sr.stop(); }catch(_){} }), (fadeMs||RULES.musicFadeMs)+120);
  if(!actx||!musicBus) return;
  const bus=musicBus, t0=actx.currentTime, dur=(fadeMs||RULES.musicFadeMs)/1000;
  musicBus=null;
  try{
    bus.gain.cancelScheduledValues(t0);
    bus.gain.setValueAtTime(Math.max(0.0001,bus.gain.value), t0);
    bus.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
  }catch(_){}
  setTimeout(()=>{ try{ bus.disconnect(); }catch(_){} }, (fadeMs||RULES.musicFadeMs)+150);
}

/* ================= DEVICE =================
   Phone housekeeping, all of it gated on a real user gesture because that is what
   the platforms require: fullscreen and the wake lock can only be requested from
   inside a tap handler. */
let wakeLock = null;

async function goFullscreen(){
  /* Only on a touch device: a desktop browser being yanked fullscreen by a game
     it just opened is obnoxious, and this prototype is played on a desktop too. */
  const touch = matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 0;
  if(!touch) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if(req){ try{ await req.call(el, {navigationUI:"hide"}); }catch(_){} }
}

async function keepAwake(){
  if(!navigator.wakeLock) return;                 // iOS Safari < 16.4, and others
  try{
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", ()=>{ wakeLock = null; });
  }catch(_){}
}

/* Leaving the app silences it. The AudioContext is suspended rather than the
   music stopped, so the theme resumes exactly where it left off — stopping and
   restarting would lose the opening/loop handoff. */
document.addEventListener("visibilitychange", async ()=>{
  if(document.hidden){
    if(actx && actx.state === "running"){ try{ await actx.suspend(); }catch(_){} }
    musicEls.forEach(el=>{ try{ el.pause(); }catch(_){} });
  }else{
    if(actx && actx.state === "suspended" && musicOn){ try{ await actx.resume(); }catch(_){} }
    /* The <audio> fallback path is not resumed: it is only reached on file://,
       where the handoff is already imperfect, and restarting mid-track would be
       worse than the silence. The Web Audio path above resumes exactly. */
    if(!wakeLock) keepAwake();                    // the lock is dropped on hide
  }
});


/* Run `audioReport()` in a console on the device if the theme still sounds wrong:
   it says what the platform actually gave us, which is the part that cannot be
   checked from a desktop. */
function audioReport(){
  if(!actx) initAudio();
  return {
    sampleRate: actx && actx.sampleRate,
    state: actx && actx.state,
    baseLatency: actx && actx.baseLatency,
    outputLatency: actx && actx.outputLatency,
    destChannels: actx && actx.destination.channelCount,
    destMaxChannels: actx && actx.destination.maxChannelCount,
    themeDecoded: !!musicBufs,
    themeChannels: musicBufs && musicBufs.loop.numberOfChannels,
    themeRate: musicBufs && musicBufs.loop.sampleRate,
    usingElementFallback: musicEls.length > 0,
    musicVolume: RULES.musicVolume
  };
}
