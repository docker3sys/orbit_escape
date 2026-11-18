import { createEchoFlight } from "./echo-flight.js";
import { createEchoAudio } from "./echo-audio.js";
import { createEchoUI } from "./echo-ui.js";
import { prepareRouteCard, saveRouteCard, shareRouteCard } from "./expedition-postcard.js";

const progress = new Map();
const storageKey = choice => "orbit-escape/two-voices/1/" + choice;

function cleanSave(record, choice) {
  if (record?.version !== 1 || record.choice !== choice) return null;
  const samples = {a:record.samples?.a === true, b:record.samples?.b === true};
  let phase = "listen";
  if (samples.a && samples.b) phase = record.phase === "arrived" ? "arrived" : "gate";
  const pos = record.position;
  const position = pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)
    ? {x:pos.x, y:pos.y} : null;
  return {version:1, choice, phase, samples, position};
}

export function echoProgress(choice) {
  if (progress.has(choice)) return progress.get(choice);
  try {
    const record = cleanSave(JSON.parse(localStorage.getItem(storageKey(choice))), choice);
    if (record) progress.set(choice, record);
    return record;
  } catch { return null; }
}

// Each inherited ending keeps its own radio log so replaying the first episode
// with a different cargo never erases an established route.
export function openEcho({choice, startMuted, onMute, onExit}) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const fresh = () => ({version:1, choice, phase:"listen", samples:{a:false,b:false}, position:null});
  let state = echoProgress(choice) ?? fresh();
  let muted = startMuted;
  let active = true, frame = 0, last = performance.now(), nextHud = 0;
  let telemetry = {}, flight, ui;
  let storageWarning = false;
  const sound = createEchoAudio();
  const events = new AbortController();
  const keys = new Map();
  const bind = (target, name, fn) => target.addEventListener(name, fn, {signal:events.signal});

  function remember() {
    const position = flight?.snapshot?.() ?? state.position;
    const record = {version:1, choice, phase:state.phase, samples:{...state.samples}, position};
    progress.set(choice,record);
    try { localStorage.setItem(storageKey(choice), JSON.stringify(record)); }
    catch {
      if (!storageWarning) ui?.toast("Рейс останется в памяти до закрытия страницы.");
      storageWarning = true;
    }
  }
  function paint() {
    ui.update({...telemetry, ...state, muted, reducedMotion:reduced.matches, saved:!storageWarning});
  }
  function onFlightEvent(name) {
    if (!active) return;
    if (name === "arrived" && state.phase === "gate") {
      state = {...state, phase:"arrived"};
      sound.cue("arrived");
      prepareRouteCard(choice).catch(()=>{});
    } else if (state.phase === "listen" && (name === "sample-a" || name === "sample-b")) {
      const id = name === "sample-a" ? "a" : "b";
      if (state.samples[id]) return;
      const samples = {...state.samples,[id]:true};
      const phase = samples.a && samples.b ? "gate" : "listen";
      state = {...state, samples, phase};
      sound.cue(name);
      if (phase === "gate") sound.cue("gate");
      ui.toast(phase === "gate" ? "Оба позывных совпали с картой. Переход найден." :
        "Первый позывной записан. Остался второй передатчик.");
    } else return;
    remember();
    paint();
  }
  function release() {
    for (const key of keys.values()) flight?.key(key,false);
    keys.clear();
  }
  function stop() {
    if (!active) return;
    active=false;
    events.abort();
    cancelAnimationFrame(frame);
    release();
    flight?.dispose(); sound.dispose(); ui?.destroy();
  }
  function finish() {
    remember();
    stop();
    onExit();
  }
  function reset() {
    release();
    flight.dispose();
    state=fresh();
    telemetry={};
    flight=createEchoFlight(ui.canvas, hooks);
    remember();
    paint();
  }
  async function card(action) {
    if (state.phase!=="arrived") return;
    try {
      if (action === "share-card" && await shareRouteCard(choice)) return;
      const ok = await saveRouteCard(choice);
      if (active && ok) ui.toast(action === "share-card" ? "Карту можно отправить из загрузок." : "Карта маршрута сохранена.");
    } catch { if (active) ui.toast("Не удалось сохранить карту. Попробуй ещё раз."); }
  }
  function action(name) {
    if (!active) return;
    switch (name) {
      case "exit": finish(); break;
      case "capture": flight.interact(); break;
      case "mute":
        muted=!muted;
        onMute(muted); sound.mute(muted);
        if (!muted) sound.unlock();
        paint(); break;
      case "replay":
        if (state.phase === "arrived") reset();
        break;
      case "save-card": case "share-card": void card(name); break;
    }
  }
  const hooks = {onEvent:onFlightEvent, onTelemetry:data=>{telemetry=data;}};
  function tick(time) {
    if (!active || document.hidden) return;
    const dt=Math.min(.08,Math.max(0,(time-last)/1000));
    last=time;
    state.reducedMotion=reduced.matches;
    flight.render(dt,state);
    sound.update(dt,state,telemetry);
    if (time>=nextHud) { paint(); nextHud=time+48; }
    frame=requestAnimationFrame(tick);
  }
  try {
    sound.mute(muted);sound.unlock();
    ui=createEchoUI(document.body,{action,moveTo:(x,y)=>flight?.moveTo(x,y)});
    flight=createEchoFlight(ui.canvas,hooks);
    if (state.position) flight.restore?.(state.position);
    if (state.phase==="arrived") prepareRouteCard(choice).catch(()=>{});
    remember(); paint();
    ui.canvas.focus({preventScroll:true});
    const directions={KeyA:"left",ArrowLeft:"left",KeyD:"right",ArrowRight:"right",
      KeyW:"up",ArrowUp:"up",KeyS:"down",ArrowDown:"down"};
    bind(window,"keydown",e=>{
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code==="Escape") {e.preventDefault();finish();return;}
      if (state.phase==="arrived") return;
      if (e.target.closest?.("button") && (e.code==="Space" || e.code==="Enter")) return;
      if (["Space","Enter","KeyE"].includes(e.code)) {
        e.preventDefault(); if (!e.repeat) flight.interact(); return;
      }
      const key=directions[e.code];
      if (key) {e.preventDefault();keys.set(e.code,key); flight.key(key,true);}
    });
    bind(window,"keyup",e=>{
      const key=keys.get(e.code);
      if (!key) return;
      keys.delete(e.code);
      if (![...keys.values()].includes(key)) flight.key(key,false);
    });
    bind(window,"blur",release);
    bind(window,"pagehide",remember);
    bind(document,"visibilitychange",()=>{
      release(); cancelAnimationFrame(frame);
      if (document.hidden) {remember();sound.suspend();}
      else {sound.unlock();last=performance.now();frame=requestAnimationFrame(tick);}
    });
    frame=requestAnimationFrame(tick);
  } catch (error) {
    stop();throw error;
  }
}
