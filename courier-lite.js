// The raster flight deck drives the very same contracts, rewards and saves as 3D career.
import {convertCourierFlight} from "./courier-flight-frame.js";
import {createCampaign, MISSIONS, UPGRADES} from "./courier/gameplay.mjs";

const flightKey = "orbit-escape.flight.v2";
const names = {earth:"Земля", moon:"Луна", mercury:"Меркурий", venus:"Венера", mars:"Марс", jupiter:"Юпитер", saturn:"Сатурн", uranus:"Уран", neptune:"Нептун"};

export function readCourierFlight() {
  try {
    const s = JSON.parse(localStorage.getItem(flightKey));
    if (Array.isArray(s?.position) && s.position.length === 3 &&
        s.position.every(n => Number.isFinite(n) && Math.abs(n) < 1e14) &&
        Number.isFinite(s.yaw) && Number.isFinite(s.pitch)) return convertCourierFlight(s,"live");
  } catch {}
  return null;
}

export function openCourierDeck(pilot) {
  const game = document.querySelector("#game");
  const button = document.querySelector("#liteContracts");
  const dialog = document.querySelector("#contractDialog");
  const ref = Object.fromEntries(Array.from(dialog.querySelectorAll("[data-courier-ref]"), el => [el.dataset.courierRef, el]));
  const work = dialog.querySelector("[data-courier=work]");
  const route = dialog.querySelector("[data-courier=route]");
  const career = createCampaign();
  const data = career.state;
  const saved = readCourierFlight();
  let shield = saved?.shield ?? data.shield;
  let energy = saved?.energy ?? data.energy;
  let scanning = false, message = "", lastPaint = "", last = performance.now(), savedAt = last;
  let sampling = null;
  game.dataset.career = "true";
  button.hidden = false;
  pilot.setPilotOptions({...data.upgrades,...data.settings});
  if (saved) pilot.restoreFlightSnapshot(saved);
  if (!data.started) career.start();

  function saveFlight() {
    data.shield = Math.max(0, Math.min(100 + data.upgrades.shield * 25, shield));
    data.energy = Math.max(0, Math.min(100, energy));
    career.save();
    try {
      localStorage.setItem(flightKey, JSON.stringify({...convertCourierFlight(pilot.getFlightSnapshot(),"legacy"), shield:data.shield, energy:data.energy}));
    } catch {}
    savedAt = performance.now();
  }
  function paint(force = false) {
    const mission = career.getMission();
    const nav = pilot.getSolarSoundState();
    const atPort = nav.target === mission.target && nav.near >= .68;
    const text = scanning ? "Сканирование · " + Math.round(data.progress * 100) + "%" :
      message || (data.active ? (atPort ? "Корабль у цели." : "Цель рейса · " + names[mission.target]) : "Доступен следующий контракт.");
    const version = [mission.id,data.active,text,atPort,scanning,data.credits,...Object.values(data.upgrades)].join("|");
    if (!force && version === lastPaint) return;
    lastPaint = version;
    ref.title.textContent = mission.title;
    ref.brief.textContent = mission.description;
    ref.status.textContent = text;
    ref.account.textContent = "Рейс " + (data.missionIndex+1) + (data.missionIndex < MISSIONS.length ? " / " + MISSIONS.length : "") + " · " + data.credits + " кр.";
    button.textContent = scanning ? Math.round(data.progress * 100) + "%" : "Рейс · " + names[mission.target];
    work.textContent = !data.active ? "Принять рейс" : mission.kind === "scan" ? "Сканировать" : "Стыковка";
    work.disabled = scanning || (data.active && !atPort);
    route.textContent = "Курс · " + names[mission.target];
    route.hidden = !data.active || atPort;
    if (force || !scanning) {
      ref.upgrades.textContent = "";
      for (const [id, upgrade] of Object.entries(UPGRADES)) {
        const item = document.createElement("button");
        const cost = career.getUpgradeCost(id);
        item.type = "button";
        item.dataset.upgrade = id;
        item.textContent = upgrade.title + " · " + data.upgrades[id] + "/" + upgrade.maxLevel + (cost === null ? "" : " · " + cost + " кр.");
        item.disabled = cost === null || data.credits < cost;
        ref.upgrades.append(item);
      }
    }
  }
  function open() { paint(true); if (!dialog.open) dialog.showModal(); }
  function click(e) {
    const el = e.target.closest("button");
    if (!el) return;
    if (el.dataset.upgrade) {
      if (career.purchase(el.dataset.upgrade)) {
        pilot.setPilotOptions({...data.upgrades,...data.settings});
        shield = Math.min(100 + data.upgrades.shield * 25, shield + (el.dataset.upgrade === "shield" ? 25 : 0));
        message = "Улучшение установлено.";
        saveFlight();
      }
    } else if (el.dataset.courier === "close") { dialog.close(); }
    else if (el.dataset.courier === "route") {
      pilot.selectDestination(career.getMission().target);
      message = "";
      dialog.close();
      (document.querySelector("#solarJump").offsetWidth ? document.querySelector("#solarJump") : document.querySelector("#jumpButton")).focus();
    } else if (el === work && !work.disabled) {
      if (!data.active) { career.accept(); message = ""; }
      else {
        const nav = pilot.getSolarSoundState();
        if (nav.target !== career.getMission().target || nav.near < .68) return;
        pilot.halt();
        if (career.getMission().kind === "scan") {scanning = true; message = "";}
        else {
          const completed = career.getMission();
          if (career.arrive(nav.target)) message = completed.log + " +" + completed.reward + " кр.";
          shield = 100 + data.upgrades.shield * 25; energy = 100;
        }
      }
      saveFlight();
    }
    paint(true);
  }
  function tick() {
    const now = performance.now();
    const dt = Math.min(.4, (now-last)/1000); last = now;
    if (document.hidden) return;
    if (scanning) {
      const mission = career.getMission(), nav = pilot.getSolarSoundState();
      if (nav.target !== mission.target || nav.near < .68 || nav.speed > .09) {
        scanning = false;
        data.progress = 0;
        message = "Сигнал потерян. Остановись у цели и повтори сканирование.";
      } else if (career.scan(dt, {targetKey:nav.target,near:true,stable:true})) {
        scanning = false;
        message = mission.log + " +" + mission.reward + " кр.";
        saveFlight();
      }
    }
    if (now - savedAt > 12000) saveFlight();
    paint();
  }
  function visibility() { last = performance.now(); if (document.hidden) saveFlight(); }
  button.addEventListener("click",open);
  dialog.addEventListener("click",click);
  window.addEventListener("pagehide",saveFlight);
  document.addEventListener("visibilitychange",visibility);
  sampling = window.setInterval(tick,200);
  open();
  return {
    close() {
      window.clearInterval(sampling);
      saveFlight();
      button.removeEventListener("click",open);
      dialog.removeEventListener("click",click);
      window.removeEventListener("pagehide",saveFlight);
      document.removeEventListener("visibilitychange",visibility);
      if (dialog.open) dialog.close();
      button.hidden = true;
      delete game.dataset.career;
      pilot.setPilotOptions({engine:0, sensitivity:1, invertY:false});
    },
  };
}
