"use strict";
/* NEURO-METRO: AVUI — audio graph, sound effects, theme
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope. */

/* ================= AUDIO — synthesised, crunchy, echoing ================= */
let actx=null, master=null, sfxBus=null, delay=null, noiseBuf=null;
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
function schedMusic(){
  if(!musicOn||!actx) return;
  const now=actx.currentTime;
  if(now > musicStart + MUSIC.length){ musicStart += MUSIC.length; musicIdx.fill(0); }
  const ahead=now+0.30;
  MUSIC.tracks.forEach((tr,ti)=>{
    let i=musicIdx[ti];
    while(i<tr.notes.length && musicStart+tr.notes[i][0] <= ahead){
      const [t,d,n,v]=tr.notes[i];
      const when=musicStart+t;
      if(when>now-0.05) playNote(tr,when,d,n,v);
      i++;
    }
    musicIdx[ti]=i;
  });
}
function startMusic(){
  initAudio(); if(!actx||musicOn||typeof MUSIC==="undefined") return;
  if(actx.state==="suspended") actx.resume();
  musicBus=actx.createGain(); musicBus.gain.value=RULES.musicVolume; musicBus.connect(master);
  musicOn=true; musicStart=actx.currentTime+0.06; musicIdx=MUSIC.tracks.map(()=>0);
  schedMusic(); musicTimer=setInterval(schedMusic,50);
}
/* The graph — context, buses, crusher curve and the noise buffer — is built
   while the title screen is up, so CONFRONT EMOTION only has to resume it and
   the theme starts on the tap rather than after it. The context begins
   suspended, which is exactly what browsers require before a gesture. */
initAudio();
window.addEventListener("pointerdown",initAudio,{once:true});
function stopMusic(fadeMs){
  if(!musicOn||!actx||!musicBus) return;
  musicOn=false;
  if(musicTimer){ clearInterval(musicTimer); musicTimer=null; }
  const bus=musicBus, t0=actx.currentTime, dur=(fadeMs||RULES.musicFadeMs)/1000;
  musicBus=null;
  try{
    bus.gain.cancelScheduledValues(t0);
    bus.gain.setValueAtTime(Math.max(0.0001,bus.gain.value), t0);
    bus.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
  }catch(_){}
  setTimeout(()=>{ try{ bus.disconnect(); }catch(_){} }, (fadeMs||RULES.musicFadeMs)+150);
}
