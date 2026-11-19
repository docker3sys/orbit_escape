import { createLastFlight } from "./last-flight.js";
import { createLastUI } from "./last-ui.js";
import { createLastAudio } from "./last-audio.js";

const log = new Map();
const signals = ["a","b","c"];
const tape = {people:["b","c","a"], relay:["a","c","b"]};
const directions = {
  KeyA:"left",ArrowLeft:"left",KeyD:"right",ArrowRight:"right",
  KeyW:"up",ArrowUp:"up",KeyS:"down",ArrowDown:"down",
};
const saveKey = choice => "orbit-escape/return-light/1/" + choice;

function initial(choice,unlocked=false) {
  return {version:1,choice,phase:"tune",entry:[],leg:0,misses:0,unlocked};
}

export function lastProgress(choice) {
  if (log.has(choice)) return log.get(choice);
  try {
    const record = JSON.parse(localStorage.getItem(saveKey(choice)));
    if (record?.version !== 1 || record.choice !== choice || !["tune","fly","home"].includes(record.phase)) return null;
    const state = initial(choice, record.unlocked === true || record.phase === "home");
    state.phase=record.phase;
    if (state.phase === "tune" && Array.isArray(record.entry)) {
      state.entry = record.entry.slice(0,2).filter(note=>signals.includes(note));
    }
    if (state.phase === "fly") state.leg=Number.isInteger(record.leg) ? Math.min(2,Math.max(0,record.leg)) : 0;
    if (state.phase === "home") state.leg=3;
    state.misses=Number.isSafeInteger(record.misses) ? Math.max(0,record.misses) : 0;
    log.set(choice,state);
    return state;
  } catch { return null; }
}

export function openLast({choice,startMuted,onMute,onExit,onVisit}) {
  let state=lastProgress(choice) ?? initial(choice);
  const sequence=tape[choice];
  const reduced=matchMedia("(prefers-reduced-motion: reduce)");
  const events=new AbortController();
  const keys=new Map();
  const sound=createLastAudio();
  let ui, flight, telemetry={};
  let muted=startMuted, active=true, warned=false;
  let frame=0, lastTime=0, hudTime=0;
  let playingIndex=-1, playingNote=null, playStart=null;

  function remember() {
    const record={version:1,choice,phase:state.phase,entry:[...state.entry],leg:state.leg,misses:state.misses,unlocked:state.unlocked};
    log.set(choice,record);
    try { localStorage.setItem(saveKey(choice),JSON.stringify(record)); }
    catch { if (!warned) ui?.toast("Журнал доступен до закрытия страницы."); warned=true; }
  }
  function paint() {
    ui.update({...telemetry,...state,sequence,playingIndex,playingNote,muted,reducedMotion:reduced.matches});
  }
  function silenceTape() { playStart=null;playingIndex=-1;playingNote=null; }
  function play(time) {
    if (playStart === null) return;
    const elapsed = time - playStart;
    const index=Math.floor(elapsed/880);
    if (index>=sequence.length) {silenceTape();paint();return;}
    const note=elapsed%880<620 ? sequence[index] : null;
    if (index!==playingIndex) sound.cue("note-"+sequence[index]);
    if (index!==playingIndex || note!==playingNote) {
      playingIndex=index;playingNote=note;paint();
    }
  }
  function pushNote(note) {
    if (state.phase!=="tune") return;
    silenceTape();
    sound.cue("note-"+note);
    state={...state,entry:[...state.entry,note]};
    if (state.entry.length===3) {
      if (state.entry.every((v,i)=>v===sequence[i])) {
        state={...state,phase:"fly",entry:[],leg:0};
        sound.cue("found");ui.toast("Обсерватория ответила. Вход в проход открыт.");
      } else {
        state={...state,entry:[]};
        ui.toast("В ответ тишина. Прослушай запись ещё раз.");
      }
    }
    remember();paint();
  }
  function flightEvent(name) {
    if (!active || state.phase!=="fly") return;
    if (name==="miss") {
      state={...state,misses:state.misses+1};sound.cue("miss");
      ui.toast("Корабль вернулся к последнему створу.");
    } else if (name==="pass") {
      const leg=state.leg+1;
      const home=leg===3;
      state={...state,leg,phase:home?"home":"fly",unlocked:state.unlocked||home};
      sound.cue(home?"home":"pass");
    } else return;
    remember();paint();
  }
  function release() {
    for (const key of keys.values()) flight?.key(key,false);
    keys.clear();
  }
  function close() {
    if (!active) return;
    active=false;events.abort();cancelAnimationFrame(frame);
    silenceTape();release();flight?.dispose();sound.dispose();ui?.destroy();
  }
  function action(name) {
    if (!active) return;
    if (name.startsWith("note-") && signals.includes(name.slice(5))) {pushNote(name.slice(5));return;}
    switch (name) {
      case "exit": remember();close();onExit();break;
      case "visit":
        if (state.phase==="home") {remember();close();onVisit();}
        break;
      case "mute":
        muted=!muted;onMute(muted);sound.mute(muted);if(!muted)sound.unlock();paint();break;
      case "listen":
        if (state.phase==="tune") {silenceTape();playStart=performance.now();play(playStart);}
        break;
      case "clear":
        if (state.phase==="tune") {silenceTape();state={...state,entry:[]};remember();paint();}
        break;
      case "replay":
        if (state.phase==="home") {
          release();flight.dispose();state=initial(choice,true);telemetry={};
          flight=createLastFlight(ui.canvas,hooks);remember();paint();
        }
        break;
    }
  }
  const hooks={onTelemetry:data=>{telemetry=data;},onEvent:flightEvent};
  function tick(time) {
    if (!active || document.hidden) return;
    const dt=lastTime ? Math.min(.08,Math.max(0,(time-lastTime)/1000)) : 0;
    lastTime=time;
    state.reducedMotion=reduced.matches;
    play(time);
    flight.render(dt,state);sound.update(dt,state,telemetry);
    if (time>=hudTime) {paint();hudTime=time+45;}
    frame=requestAnimationFrame(tick);
  }
  const bind=(target,name,fn)=>target.addEventListener(name,fn,{signal:events.signal});
  try {
    sound.mute(muted);sound.unlock();
    ui=createLastUI(document.body,{
      action, steer:(x,y)=>{if(state.phase==="fly")flight?.steer(x,y);},
      stick:(x,y)=>flight?.stick(x,y)
    });
    flight=createLastFlight(ui.canvas,hooks);
    remember();paint();ui.canvas.focus({preventScroll:true});
    bind(window,"keydown",e=>{
      if(e.ctrlKey||e.altKey||e.metaKey)return;
      if(e.code==="Escape") {e.preventDefault();action("exit");return;}
      if(state.phase==="tune") {
        if(e.repeat)return;
        const n=["Digit1","Digit2","Digit3"].indexOf(e.code);
        if(n!==-1){e.preventDefault();pushNote(signals[n]);}
        if(e.code==="KeyR")action("listen");
      } else if(state.phase==="fly"&&directions[e.code]) {
        e.preventDefault();keys.set(e.code,directions[e.code]);flight.key(directions[e.code],true);
      }
    });
    bind(window,"keyup",e=>{
      const key=keys.get(e.code);if(!key)return;keys.delete(e.code);
      if(![...keys.values()].includes(key))flight.key(key,false);
    });
    bind(window,"blur",release);
    bind(document,"visibilitychange",()=>{
      cancelAnimationFrame(frame);release();silenceTape();
      if(document.hidden){remember();sound.suspend();}
      else {sound.unlock();lastTime=0;paint();frame=requestAnimationFrame(tick);}
    });
    frame=requestAnimationFrame(tick);
  } catch(error) {close();throw error;}
}
