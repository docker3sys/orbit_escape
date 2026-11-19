import "./webview-compat.js";
import { getQualityPreference, setQualityPreference } from "./mobile-quality.js";
import { createSolarFallback } from "./solar-fallback.js";
import { openCourierDeck, readCourierFlight } from "./courier-lite.js";
import { createCampaign } from "./courier/gameplay.mjs";
import { lastProgress, openLast } from "./last-session.js";
import { echoProgress, openEcho } from "./echo-session.js";
import * as THREE from "./vendor/three.module.js";
import { createSolarRadio } from "./solar-radio.js";
import { createAudio } from "./expedition-audio.js";
import { createFlight } from "./expedition-flight.js";
import { createFallbackFlight } from "./expedition-fallback.js";
import { createExpeditionUI } from "./expedition-ui.js";

const SAVE = "orbit-escape/quiet-beacon/1";
const SOUND = "orbit-escape/quiet-beacon/muted";
const HAND = "orbit-escape/pilot-hand/1";
const stages = ["scan", "gate", "approach", "choice", "deliver", "return", "complete"];
const hangar = document.querySelector("#hangar");
const solarView = document.querySelector("#game");
const start = document.querySelector("#beaconStart");
const free = document.querySelector("#solarStart");
const nextStart = document.querySelector("#echoStart");
const beaconTab = document.querySelector("#chapterBeacon");
const echoTab = document.querySelector("#chapterEcho");
const lastTab = document.querySelector("#chapterLast");
const lastStart = document.querySelector("#lastStart");
const fresh = document.querySelector("#freshStart");
const status = document.querySelector("#launchStatus");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const bindings = {
  ArrowLeft:"left", KeyA:"left", ArrowRight:"right", KeyD:"right", ArrowUp:"up", ArrowDown:"down",
  KeyW:"thrust", Space:"thrust", KeyS:"brake", ShiftLeft:"brake", ShiftRight:"brake",
};
const held = new Set();
let session = null;
let solar = null;
let usingSolarCanvas = false;
let courierFrame = null;
let courierDeck = null;
const careerStart = document.querySelector("#careerStart");
const graphics = document.querySelector("#graphicsSelect");
const veteran = createCampaign().state;
if (veteran.started && !getItem("orbit-escape/graphics/1")) setQualityPreference(veteran.settings.quality);
graphics.value = getQualityPreference();
graphics.addEventListener("change", () => {
  setQualityPreference(graphics.value);
  const career = createCampaign();
  if (career.state.started) career.setSetting("quality", graphics.value);
});
let opening = false;
let muted = getItem(SOUND) === null ? veteran.started && !veteran.settings.sound : getItem(SOUND) === "1";
let radio = null;
const handDialog = document.querySelector("#handDialog");
const handChoices = handDialog.querySelectorAll("[data-hand-choice]");
const hangarSound = document.querySelector("#hangarSound");
const solarSound = document.querySelector("#solarSound");

function chooseHand(preference) {
  document.documentElement.dataset.hand = preference;
  for (const choice of handChoices) {
    choice.setAttribute("aria-pressed", String(choice.dataset.handChoice === preference));
  }
}
chooseHand(getItem(HAND) === "left" ? "left" : "right");
for (const choice of handChoices) {
  choice.addEventListener("click", () => {
    chooseHand(choice.dataset.handChoice);
    writeItem(HAND, choice.dataset.handChoice);
  });
}
document.querySelector("#handSwitch").addEventListener("click", () => handDialog.showModal());
handDialog.addEventListener("click", event => {
  if (event.target === handDialog) handDialog.close();
});

function setSoundMuted(value) {
  muted = value;
  writeItem(SOUND, value ? "1" : "0");
  syncSoundButtons();
  const career = createCampaign();
  if (career.state.started) career.setSetting("sound", !value);
}
function syncSoundButtons() {
  for (const button of [hangarSound, solarSound]) {
    if (!button) continue;
    button.textContent = muted ? "Звук выключен" : "Звук включён";
    button.setAttribute("aria-pressed", String(!muted));
  }
}
hangarSound.addEventListener("click", () => setSoundMuted(!muted));
solarSound?.addEventListener("click", () => {
  setSoundMuted(!muted);
  radio?.setMuted(muted);
});
syncSoundButtons();

let checkpoint = readCheckpoint();
let otherFlightActive = false;
const inherited = nextChoice();
let chapter = "beacon";
if (checkpoint?.stage === "complete" || echoProgress(inherited)) chapter = "echo";
if (echoProgress(inherited)?.phase === "arrived" || lastProgress(inherited)) chapter = "last";

function getItem(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeItem(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

function readCheckpoint() {
  try {
    const parsed = JSON.parse(getItem(SAVE));
    if (parsed?.version !== 1 || !stages.includes(parsed.stage)) return null;
    const cargoStage = ["deliver","return","complete"].includes(parsed.stage);
    if (cargoStage && !["people","relay"].includes(parsed.choice)) return null;
    return {version:1, stage:parsed.stage, choice:cargoStage ? parsed.choice : null};
  } catch { return null; }
}

function persist(s) {
  checkpoint = {version:1, stage:s.state.stage, choice:s.state.choice};
  if (!writeItem(SAVE, JSON.stringify(checkpoint)) && !s.storageWarning) {
    s.storageWarning = true;
    s.ui.toast("Хранилище недоступно. Рейс сохранится до закрытия страницы.");
  }
}

function menu(message = "") {
  solarView.hidden = true;
  hangar.hidden = false;
  careerStart.textContent = createCampaign().state.started ? "Продолжить карьеру" : "Карьера курьера";
  status.textContent = message;
  status.hidden = !message;
  const choice = nextChoice();
  const showBeacon = chapter === "beacon";
  const showEcho = chapter === "echo";
  const showLast = chapter === "last";
  const savedEcho = showEcho && echoProgress(choice);
  const savedLast = showLast && lastProgress(choice);
  hangar.dataset.chapter = chapter;
  for (const [tab, selected] of [[beaconTab,showBeacon],[echoTab,showEcho],[lastTab,showLast]]) {
    tab.setAttribute("aria-pressed",String(selected));
  }
  const tab = showBeacon ? beaconTab : showEcho ? echoTab : lastTab;
  document.querySelector("#chapterNumber").textContent = "Экспедиция " + tab.querySelector("small").textContent;
  const titles = {beacon:"Тихий<br>маяк",echo:"Два<br>голоса",last:"Обратный<br>свет"};
  document.querySelector("#chapterTitle").innerHTML = titles[chapter] + "<span>.</span>";
  let brief = "У Voyager 1 услышали ответ из пустого сектора. Найди источник сигнала.";
  if (showEcho) {
    brief = choice === "people"
      ? "Со «Створа» отзывается знакомый механик. На его частоту накладывается второй позывной."
      : "У «Кромки» ретранслятор принимает два голоса на одной частоте. Станция может заслонить один из них.";
    if (savedEcho?.phase === "arrived") brief = "Открытый тобой маршрут работает. Возвращайся к станции посмотреть на рейсовый челнок.";
  }
  if (showLast) {
    brief = "Первый челнок привёз запись из-за норы. Ответь ей знакомыми позывными и пройди к потерянной обсерватории.";
    if (savedLast?.phase === "home") brief = "Обсерватория снова в эфире. Из её окон видно, как к станции подходит следующий рейс.";
  }
  document.querySelector("#chapterBrief").textContent = brief;
  nextStart.hidden = !showEcho;
  lastStart.hidden = !showLast;
  start.hidden = !showBeacon;
  fresh.hidden = !showBeacon || !checkpoint || checkpoint.stage === "complete";
  nextStart.firstChild.textContent = savedEcho?.phase === "arrived" ? "Вернуться на маршрут " :
    savedEcho ? "Продолжить поиск " : "Вылететь к «Кромке» ";
  lastStart.firstChild.textContent = savedLast?.phase === "home" ? "Вернуться в обсерваторию " :
    savedLast?.phase === "fly" ? "Продолжить полёт " : "Принять передачу ";
  start.firstChild.textContent = !checkpoint ? "Начать экспедицию " :
    checkpoint.stage === "complete" ? "Открыть бортовой журнал " : "Продолжить экспедицию ";
}
function nextChoice() {
  return checkpoint?.stage === "complete" ? checkpoint.choice : "relay";
}
function chooseChapter(selected) {
  if (opening || session || otherFlightActive) return;
  if (chapter === selected) return;
  chapter = selected;
  menu();
  const intro = document.querySelector(".hangar-intro");
  intro.classList.remove("is-tuning");
  void intro.offsetWidth;
  intro.classList.add("is-tuning");
}
function beginLater(chapterId) {
  if (opening || session || otherFlightActive) return;
  chapter = chapterId;
  otherFlightActive = true;
  hangar.hidden = true;
  const finale = chapterId === "last";
  const enter = finale ? openLast : openEcho;
  try {
    enter({
      choice:nextChoice(), startMuted:muted,
      onMute:setSoundMuted,
      onExit() {
        otherFlightActive=false;
        menu();
        (finale ? lastStart : nextStart).focus({preventScroll:true});
      },
      onLast() { otherFlightActive=false; beginLater("last"); },
      onVisit() { otherFlightActive=false; void openSolar(true); },
    });
  } catch (error) {
    otherFlightActive=false;
    console.error("Expedition launch",error);
    menu("Не удалось открыть экспедицию. Попробуй ещё раз.");
  }
}
function updateUi(s) {
  const state = s.state;
  const special = state.stage === "deliver" && (state.choice === "people" ? {
    title:"Доставь людей на «Створ»", location:"Буксир · 6 пассажиров",
  } : { title:"Доставь ретранслятор", location:"Буксир · ретранслятор" });
  s.ui.update({...s.telemetry, ...state, ...special, muted, saved:!!checkpoint, reducedMotion:reduced.matches});
}
function change(s, stage, choice=s.state.choice) {
  s.state = {stage,choice,reducedMotion:reduced.matches};
  s.telemetry = {};
  persist(s);
  updateUi(s);
}
const transitions = {
  signal:["scan","gate","lock"], crossed:["gate","approach","warp"], docked:["approach","choice","dock"],
  delivered:["deliver","return","dock"], returned:["return","complete","complete"],
};
function flightEvent(s, name) {
  if (session !== s) return;
  if (name === "rescue") {
    s.sound.cue("rescue");
    s.ui.toast("Бортовой автопилот вернул корабль к безопасному бую.");
    return;
  }
  const hop = transitions[name];
  if (!hop || hop[0] !== s.state.stage) return;
  s.sound.cue(hop[2]);
  change(s,hop[1]);
  if (name === "delivered") s.ui.toast(s.state.choice === "people"
    ? "«Створ» вышел на связь. На посту шестеро жителей." : "Ретранслятор включён. Проход держится дольше.");
}

function releaseKeys() {
  for (const key of held) session?.flight?.input(bindings[key], false);
  held.clear();
}

function leave() {
  const s = session;
  if (!s) return;
  releaseKeys();
  session = null;
  cancelAnimationFrame(s.frame);
  s.flight?.dispose();
  s.sound.dispose();
  s.ui.destroy();
  menu();
  start.focus({preventScroll:true});
}

function act(s, action) {
  if (session !== s) return;
  if (action === "exit") { leave(); return; }
  if (action === "echo" && s.state.stage === "complete") {
    leave();
    beginLater("echo");
    return;
  }
  if (action === "mute") {
    setSoundMuted(!muted);
    s.sound.mute(muted);
    if (!muted) s.sound.unlock();
    updateUi(s);
    return;
  }
  if (action === "new") {
    releaseKeys();
    s.flight.reset();
    change(s,"scan",null);
    return;
  }
  if (action === "people" || action === "relay") {
    if (s.state.stage !== "choice") return;
    s.sound.cue(action);
    change(s,"deliver",action);
  } else if (action === "interact") {
    s.flight.input("action",true);
    s.flight.input("action",false);
  }
}

function tick(s,time) {
  if (session !== s || document.hidden) return;
  const dt = Math.min(.05, Math.max(0,(time-s.last)/1000));
  s.last = time;
  s.state.reducedMotion = reduced.matches;
  s.flight.render(dt,s.state);
  s.sound.update(dt,s.state,s.telemetry);
  // The canvas runs at display speed; radio labels don't need a DOM write on every frame.
  if (time >= s.nextHud) { updateUi(s); s.nextHud=time+48; }
  s.frame = requestAnimationFrame(t => tick(s,t));
}

function installFlightCanvas(s,hooks) {
  // Keep the focusable input surface and its gesture listeners when the GPU goes away.
  const display = document.createElement("canvas");
  display.className = s.ui.canvas.className;
  display.style.pointerEvents = "none";
  display.setAttribute("aria-hidden","true");
  s.ui.canvas.after(display);
  s.flat = true;
  s.flight = createFallbackFlight(display,THREE,hooks);
}
function begin(reset=false) {
  if (opening || session || otherFlightActive) return;
  const saved = !reset && checkpoint;
  const s = {
    state:{stage:saved?.stage || "scan",choice:saved?.choice || null,reducedMotion:reduced.matches},
    telemetry:{},nextHud:0,frame:0,last:performance.now(), sound:createAudio(), ui:null, flight:null
  };
  try {
    session=s;
    s.sound.mute(muted);
    s.sound.unlock();
    s.ui=createExpeditionUI(document.body,{
      action:action=>act(s,action),
      control:(key,down)=>s.flight?.input(key,down),
      stick:(x,y)=>s.flight?.stick(x,y),
      look:(dx,dy)=>s.flight?.drag(dx,dy)
    });
    const hooks = {
      onEvent:name=>flightEvent(s,name),
      onTelemetry:data=>{s.telemetry=data;},
      onContextLost:() => {
        if (session !== s || s.flat) return;
        s.flight?.dispose();
        releaseKeys();
        installFlightCanvas(s,hooks);
        s.ui.toast("Полёт продолжается в облегчённой графике.");
      }
    };
    try {
      s.flight=createFlight(s.ui.canvas,THREE,hooks);
    } catch (err) {
      installFlightCanvas(s,hooks);
    }
    hangar.hidden=true;
    persist(s);
    updateUi(s);
    s.frame=requestAnimationFrame(t=>tick(s,t));
    s.ui.canvas.focus({preventScroll:true});
  } catch(err) {
    session=null;
    s.flight?.dispose();s.sound.dispose();s.ui?.destroy();
    console.error("Expedition launch",err);
    menu("Не удалось открыть полёт. Попробуй снова в браузере с поддержкой Canvas.");
  }
}

beaconTab.addEventListener("click",()=>chooseChapter("beacon"));
echoTab.addEventListener("click",()=>chooseChapter("echo"));
lastTab.addEventListener("click",()=>chooseChapter("last"));
nextStart.addEventListener("click",()=>beginLater("echo"));
lastStart.addEventListener("click",()=>beginLater("last"));
start.addEventListener("click",()=>begin());
fresh.addEventListener("click",()=>{
  if (window.confirm("Начать новый рейс и заменить текущее сохранение?")) begin(true);
});
function observatoryChoice() {
  const preferred = nextChoice();
  return [preferred, preferred === "people" ? "relay" : "people"].find(key => lastProgress(key)?.unlocked);
}
function rasterSolar(snapshot = {}) {
  if (!usingSolarCanvas) {
    solar?.retireSolarFlight?.();
    solar = createSolarFallback({...snapshot, unlocked:observatoryChoice()});
    usingSolarCanvas = true;
  }
  return solar;
}
function leaveSolar() {
  courierDeck?.close();
  courierDeck = null;
  radio?.stop();
  solar?.pauseSolarFlight();
  menu();
  free.focus();
}
function closeCareer(syncSettings = true) {
  if (!courierFrame) return;
  courierFrame.remove();
  courierFrame = null;
  otherFlightActive = false;
  const career = createCampaign();
  // The courier's settings screen may have changed them while the outer page was idle.
  if (syncSettings && career.state.started) {
    setQualityPreference(career.state.settings.quality);
    graphics.value = getQualityPreference();
    muted = !career.state.settings.sound;
    writeItem(SOUND,muted ? "1" : "0");
    syncSoundButtons();
  }
  menu();
  careerStart.focus();
}
function openCareer() {
  if (opening || session || otherFlightActive) return;
  // Both cockpits share the same pilot preferences, including on the very first contract.
  const career = createCampaign();
  career.setSetting("quality",getQualityPreference());
  career.setSetting("sound",!muted);
  if (usingSolarCanvas) { void openSolar(false,true); return; }
  otherFlightActive = true;
  hangar.hidden = true;
  const frame = document.createElement("iframe");
  frame.id = "courierFrame";
  frame.title = "Солнечный курьер";
  const embedded = document.querySelector("template#portableCourier");
  if (embedded) frame.srcdoc = embedded.content.textContent;
  else frame.src = "./courier/index.html";
  courierFrame = frame;
  document.body.append(frame);
  frame.focus();
}
careerStart.addEventListener("click", openCareer);
window.addEventListener("orbit:courier-exit", closeCareer);
window.addEventListener("orbit:courier-lite", () => {
  if (!courierFrame) return;
  closeCareer(false);
  void openSolar(false,true);
});
free.addEventListener("click",()=>openSolar(false));
async function openSolar(visit, career = false) {
  if (opening || session || otherFlightActive) return;
  opening=true;free.disabled=true;start.disabled=true;
  radio ??= createSolarRadio({
    telemetry:() => solar?.getSolarSoundState(),
    signal:document.querySelector("#solarSignal"),
    log:document.querySelector("#solarListening"),
  });
  radio.start(muted);
  try {
    solarView.hidden=false;
    if (career) rasterSolar(readCourierFlight() || {});
    else if (!solar) {
      try { solar = await import("./app.js"); }
      catch { rasterSolar(); }
    }
    const unlocked=observatoryChoice();
    if (unlocked) solar.setObservatoryUnlocked(unlocked);
    solar.resumeSolarFlight();
    if (visit && unlocked) solar.visitObservatory();
    if (career) courierDeck = openCourierDeck(solar);
    hangar.hidden=true;
  } catch(err) {
    radio.stop();
    solar?.pauseSolarFlight();
    console.error("Solar flight",err);
    menu("Не удалось запустить графику. Обнови Android System WebView и открой игру снова.");
  } finally {
    opening=false;free.disabled=false;start.disabled=false;
  }
}
window.addEventListener("orbit:solar-context-lost", event => {
  const visible = !solarView.hidden && !document.hidden && !courierFrame;
  rasterSolar(event.detail || {});
  if (visible) solar.resumeSolarFlight();
});
document.querySelector("#solarMenu").addEventListener("click",leaveSolar);
document.addEventListener("orbit:back", event => {
  const dialog = document.querySelector("dialog[open]");
  if (dialog) dialog.close();
  else if (courierFrame) {
    if (!courierFrame.contentWindow?.orbitCourierBack?.()) closeCareer();
  } else if (!solarView.hidden) {
    const route = document.querySelector("#solarRoute");
    if (route?.getAttribute("aria-expanded") === "true") route.click();
    else leaveSolar();
  } else if (session) leave();
  else if (otherFlightActive) {
    const exit = document.querySelector(".last-screen [data-action=exit], .echo-screen [data-action=exit]");
    if (exit) exit.click();
  } else return;
  event.preventDefault();
});
window.addEventListener("keydown",event=>{
  const s=session;
  if (!s || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.code === "Escape") { event.preventDefault();leave();return; }
  if (s.state.stage === "complete" || s.state.stage === "choice") return;
  if (event.target.closest?.("button") && ["Space","Enter"].includes(event.code)) return;
  if (event.code === "Enter" || event.code === "KeyE") {
    event.preventDefault();
    if (!event.repeat) act(s,"interact");
    return;
  }
  if (bindings[event.code]) {
    event.preventDefault();
    if (!held.has(event.code)) {
      held.add(event.code);s.flight.input(bindings[event.code],true);
    }
  }
});
window.addEventListener("keyup",event=>{
  if (!held.delete(event.code)) return;
  if (![...held].some(code=>bindings[code]===bindings[event.code])) session?.flight?.input(bindings[event.code],false);
});
window.addEventListener("blur",releaseKeys);
function suspendSolar() {
  if (solar && !solarView.hidden) { radio?.stop(); solar.pauseSolarFlight(); }
}
function resumeSolar() {
  if (solar && !solarView.hidden && !document.hidden) { solar.resumeSolarFlight(); radio?.start(muted); }
}
window.addEventListener("pagehide", suspendSolar);
document.addEventListener("freeze", suspendSolar);
window.addEventListener("pageshow", resumeSolar);
document.addEventListener("resume", resumeSolar);
document.addEventListener("visibilitychange",()=>{
  const s=session;
  if (!s) {
    if (document.hidden) suspendSolar(); else resumeSolar();
    return;
  }
  releaseKeys();cancelAnimationFrame(s.frame);
  if (document.hidden) s.sound.suspend();
  else {s.sound.unlock();s.last=performance.now();s.frame=requestAnimationFrame(t=>tick(s,t));}
});
menu();
