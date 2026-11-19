/** Engine-independent campaign, progression and resilient local saves. */
export const STORAGE_KEY = 'orbit-escape.campaign.v1';
export const BACKUP_KEY = `${STORAGE_KEY}.backup`;
export const SCAN_SECONDS = 4;

const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const MISSIONS = freeze([
  { id: 'first-flight', title: 'Первый рейс', kind: 'delivery', target: 'moon', reward: 160, required: 1,
    description: 'Доставь навигационный модуль на Луну. Подлети к базе и нажми «Стыковка».',
    log: 'Первый груз принят. Лунная база приветствует нового солнечного курьера.' },
  { id: 'mars-echo', title: 'Эхо красной планеты', kind: 'scan', target: 'mars', reward: 220, required: 1, scanSeconds: SCAN_SECONDS,
    description: 'Исследуй Марс: подлети ближе и нажми «Сканировать». Корабль автоматически погасит скорость.',
    log: 'Марсианский ретранслятор снова на связи. Данные исследования сохранены.' },
  { id: 'venus-mail', title: 'Почта над облаками', kind: 'delivery', target: 'venus', reward: 250, required: 1,
    description: 'Отвези данные в облачный порт Венеры. Для дальнего перелёта выбери цель на карте.',
    log: 'Облачный порт принял посылку. В золотистых облаках загорается новый маяк.' },
  { id: 'mercury-dawn', title: 'Навстречу рассвету', kind: 'scan', target: 'mercury', reward: 280, required: 1, scanSeconds: SCAN_SECONDS,
    description: 'Отсканируй Меркурий. Приблизься к планете и нажми кнопку исследования.',
    log: 'Солнечный зонд передал новые наблюдения. Внутренний маршрут изучен.' },
  { id: 'home-supplies', title: 'Короткая остановка дома', kind: 'delivery', target: 'earth', reward: 180, required: 1,
    description: 'Вернись на Землю за оборудованием для дальней экспедиции. В порту можно улучшить корабль.',
    log: 'Оборудование загружено. Впереди — внешние планеты и новые порты.' },
  { id: 'jupiter-relay', title: 'За поясом астероидов', kind: 'delivery', target: 'jupiter', reward: 340, required: 1,
    description: 'Доставь ретранслятор к Юпитеру. Прыжок доведёт тебя до сектора, дальше нужен точный подход.',
    log: 'Ретранслятор включён. Голос Земли теперь уверенно слышен у Юпитера.' },
  { id: 'giant-weather', title: 'Погода у гиганта', kind: 'scan', target: 'jupiter', reward: 300, required: 1, scanSeconds: SCAN_SECONDS,
    description: 'Исследуй облака Юпитера. Сохраняй небольшую скорость во время сканирования.',
    log: 'Наблюдения за вихрями гиганта добавлены в журнал экспедиции.' },
  { id: 'saturn-post', title: 'Письма среди колец', kind: 'delivery', target: 'saturn', reward: 420, required: 1,
    description: 'Отвези почту к Сатурну. Даже у далёких колец кто-то ждёт вестей из дома.',
    log: 'Почта доставлена. Станция у Сатурна встречает курьера огнями маяка.' },
  { id: 'ring-survey', title: 'Ледяная россыпь', kind: 'scan', target: 'saturn', reward: 360, required: 1, scanSeconds: SCAN_SECONDS,
    description: 'Отсканируй Сатурн и его кольца. Подлети ближе и нажми «Сканировать».',
    log: 'Изученные кольца внесены в навигационный атлас. Путь дальше открыт.' },
  { id: 'uranus-light', title: 'Бирюзовый маяк', kind: 'delivery', target: 'uranus', reward: 480, required: 1,
    description: 'Доставь запасной модуль к Урану. Восстанови связь с далёким бирюзовым портом.',
    log: 'Бирюзовый маяк снова в эфире. Остаётся последний участок большого маршрута.' },
  { id: 'neptune-horizon', title: 'Синий предел', kind: 'scan', target: 'neptune', reward: 600, required: 1, scanSeconds: SCAN_SECONDS,
    description: 'Исследуй Нептун. Эта запись завершит карту курьерской сети внешних планет.',
    log: 'Дальний сигнал получен. От Меркурия до Нептуна больше нет забытых портов.' },
  { id: 'homebound', title: 'Дорога домой', kind: 'delivery', target: 'earth', reward: 900, required: 1,
    description: 'Вернись на Землю с картой всей сети. После этого доступны свободные полёты и новые контракты.',
    log: 'Большой маршрут завершён. Все порты на связи — следующий рейс выбираешь ты.' },
]);

export const UPGRADES = freeze({
  engine: { id: 'engine', title: 'Импульсный двигатель', description: 'Быстрее разгон и выше скорость ручного полёта.', baseCost: 150, maxLevel: 4 },
  scanner: { id: 'scanner', title: 'Исследовательский сканер', description: 'Меньше времени на сканирование планет.', baseCost: 140, maxLevel: 4 },
  shield: { id: 'shield', title: 'Защитный контур', description: 'Усиливает защиту корабля при опасном сближении.', baseCost: 180, maxLevel: 4 },
});

export const FACTS = freeze({
  mercury: 'Меркурий — ближайшая к Солнцу планета. Его каменистая поверхность покрыта кратерами.',
  venus: 'Плотная атмосфера Венеры удерживает тепло, а поверхность скрыта под сплошным слоем облаков.',
  earth: 'Земля — наш дом. Синие океаны, белые облака и знакомые материки позволяют узнать её из космоса.',
  moon: 'Луна — естественный спутник Земли. На её поверхности сохранилось множество ударных кратеров.',
  mars: 'Красноватый оттенок Марсу придают соединения железа в грунте. У планеты есть полярные ледяные шапки.',
  jupiter: 'Юпитер — крупнейшая планета Солнечной системы. Полосы его атмосферы образованы облаками и потоками газа.',
  saturn: 'Кольца Сатурна состоят главным образом из частиц льда — от мелких крупинок до больших глыб.',
  uranus: 'Ось вращения Урана сильно наклонена: планета словно катится по своей орбите на боку.',
  neptune: 'Нептун — самый далёкий из восьми планет. В его атмосфере дуют чрезвычайно сильные ветры.',
  scale_note: 'Порты, ускоренные перелёты и игровые награды вымышлены. Время рейса сокращено ради удобства игры.',
});

const BODY_KEYS = freeze(['mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
const BODY_NAMES = freeze({ mercury: 'Меркурий', venus: 'Венера', earth: 'Земля', moon: 'Луна', mars: 'Марс', jupiter: 'Юпитер', saturn: 'Сатурн', uranus: 'Уран', neptune: 'Нептун' });
const UPGRADE_KEYS = Object.keys(UPGRADES);
const MAX_CREDITS = 999999999;
const MAX_MISSION_INDEX = 1000000;
function copyKnown(source, keys) {
  const result = {};
  for (const key of keys) result[key] = source[key];
  return result;
}

const DEFAULT_SETTINGS = freeze({ quality: 'auto', sensitivity: 1, invertY: false, sound: true, haptics: true });

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value, min, max) => Number.isInteger(value) && finite(value, min, max);
const isBody = (key) => BODY_KEYS.includes(key);
const noop = () => {};

function freshState() {
  return {
    version: 1, started: false, missionIndex: 0, active: false, progress: 0, credits: 0,
    upgrades: { engine: 0, scanner: 0, shield: 0 }, visited: [], discovered: [],
    settings: { ...DEFAULT_SETTINGS }, stats: { contracts: 0, scans: 0, distance: 0 },
    shield: 100, energy: 100, cargo: 0,
  };
}

function validSetting(key, value) {
  if (key === 'quality') return ['auto', 'low', 'high'].includes(value);
  if (key === 'sensitivity') return finite(value, 0.3, 2.5);
  if (['invertY', 'sound', 'haptics'].includes(key)) return typeof value === 'boolean';
  return false;
}

/** Validate types before accepting a save; never merge unknown objects/prototypes. */
function validateSave(raw) {
  if (!isObject(raw) || raw.version !== 1 || typeof raw.started !== 'boolean' || typeof raw.active !== 'boolean') return null;
  if (!integer(raw.missionIndex, 0, MAX_MISSION_INDEX) || !finite(raw.progress, 0, 1) || !integer(raw.credits, 0, MAX_CREDITS)) return null;
  if (!raw.started && (raw.active || raw.missionIndex !== 0)) return null;
  if (!isObject(raw.upgrades) || UPGRADE_KEYS.some((key) => !integer(raw.upgrades[key], 0, UPGRADES[key].maxLevel))) return null;
  if (!isObject(raw.settings) || Object.keys(DEFAULT_SETTINGS).some((key) => !validSetting(key, raw.settings[key]))) return null;
  if (!isObject(raw.stats) || !integer(raw.stats.contracts, 0, MAX_MISSION_INDEX) || !integer(raw.stats.scans, 0, MAX_MISSION_INDEX) || !finite(raw.stats.distance, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (!finite(raw.shield, 0, 10000) || !finite(raw.energy, 0, 100)) return null;
  if (![raw.visited, raw.discovered].every((keys) => Array.isArray(keys) && keys.length <= BODY_KEYS.length && keys.every(isBody))) return null;
  if (raw.cargo !== undefined && !integer(raw.cargo, 0, MAX_CREDITS)) return null;
  return {
    version: 1, started: raw.started, missionIndex: raw.missionIndex, active: raw.active,
    progress: raw.active ? raw.progress : 0, credits: raw.credits,
    upgrades: copyKnown(raw.upgrades, UPGRADE_KEYS),
    visited: [...new Set(raw.visited)], discovered: [...new Set(raw.discovered)],
    settings: copyKnown(raw.settings, Object.keys(DEFAULT_SETTINGS)),
    stats: { contracts: raw.stats.contracts, scans: raw.stats.scans, distance: raw.stats.distance },
    shield: raw.shield, energy: raw.energy, cargo: raw.cargo ?? 0,
  };
}

function parseSave(text) {
  if (typeof text !== 'string' || text.length > 100000) return null;
  try { return validateSave(JSON.parse(text)); } catch { return null; }
}

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Optional storage implements getItem/setItem; pass null to run without storage. */
export function createCampaign(storage = defaultStorage()) {
  const listeners = new Set();
  let saveFailureNotified = false;
  let state = null;
  if (storage && typeof storage.getItem === 'function') {
    for (const key of [STORAGE_KEY, BACKUP_KEY]) {
      try { state = parseSave(storage.getItem(key)); } catch { state = null; }
      if (state) break;
    }
  }
  state ??= freshState();

  const emit = (event) => {
    for (const listener of [...listeners]) {
      try { listener(event); } catch { /* UI errors must not interrupt progression. */ }
    }
  };

  function save(replaceBackup = false) {
    const snapshot = validateSave(state);
    if (!snapshot || !storage || typeof storage.setItem !== 'function') return failedSave();
    const text = JSON.stringify(snapshot);
    let previous = null;
    try { previous = parseSave(storage.getItem?.(STORAGE_KEY)); } catch { /* Keep playing in private/restricted mode. */ }
    // Writing a known-good backup first leaves a recoverable checkpoint if the
    // following primary write is interrupted. A failed backup does not block a
    // primary write when the browser has room for only one copy.
    try { storage.setItem(BACKUP_KEY, JSON.stringify(replaceBackup ? snapshot : (previous ?? snapshot))); } catch { /* Best effort. */ }
    try {
      storage.setItem(STORAGE_KEY, text);
      saveFailureNotified = false;
      return true;
    } catch { return failedSave(); }
  }

  function failedSave() {
    if (!saveFailureNotified) {
      saveFailureNotified = true;
      emit({ type: 'save-error', text: 'Сохранение сейчас недоступно. Игра продолжится, но прогресс может не сохраниться.', reward: 0 });
    }
    return false;
  }

  function getMission() {
    if (state.missionIndex < MISSIONS.length) return MISSIONS[state.missionIndex];
    const repeat = state.missionIndex - MISSIONS.length;
    const target = BODY_KEYS[(repeat * 5 + 3) % BODY_KEYS.length];
    const kind = repeat % 3 === 1 ? 'scan' : 'delivery';
    return freeze({
      id: `freelance-${repeat + 1}`, title: `${kind === 'scan' ? 'Исследование' : 'Новый рейс'}: ${BODY_NAMES[target]}`,
      kind, target, reward: 240 + (repeat % 5) * 50, required: 1, scanSeconds: SCAN_SECONDS,
      description: kind === 'scan' ? `Исследуй цель «${BODY_NAMES[target]}»: приблизься и нажми «Сканировать».` : `Доставь посылку в сектор «${BODY_NAMES[target]}» и выполни стыковку.`,
      log: 'Контракт выполнен. Курьерская сеть благодарит за надёжный рейс.',
    });
  }

  function getUpgradeCost(id) {
    const definition = Object.hasOwn(UPGRADES, id) ? UPGRADES[id] : null;
    if (!definition || state.upgrades[id] >= definition.maxLevel) return null;
    return Math.round(definition.baseCost * (1 + state.upgrades[id] * 0.9));
  }

  function getScanDuration() { return SCAN_SECONDS / (1 + state.upgrades.scanner * 0.18); }

  function complete(mission) {
    if (!state.started || !state.active || getMission().id !== mission.id) return false;
    const reward = Math.min(mission.reward, MAX_CREDITS - state.credits);
    state.credits += reward;
    state.active = false;
    state.progress = 0;
    state.missionIndex += 1;
    state.stats.contracts += 1;
    if (mission.kind === 'scan') {
      state.stats.scans += 1;
      if (!state.discovered.includes(mission.target)) state.discovered.push(mission.target);
    }
    save();
    emit({ type: 'mission', phase: 'complete', mission, text: mission.log, reward: 0 });
    emit({ type: 'reward', mission, text: `${mission.title}: +${reward} кр.`, reward });
    return true;
  }

  const api = {
    state,
    getMission,
    getUpgradeCost,
    getScanDuration,
    subscribe(callback) {
      if (typeof callback !== 'function') return noop;
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    start() {
      if (state.started) return false;
      state.started = true;
      state.active = true;
      state.progress = 0;
      save();
      emit({ type: 'mission', phase: 'start', mission: getMission(), text: 'Первый контракт уже на борту. Курс на Луну!', reward: 0 });
      return true;
    },
    reset() {
      const settings = { ...state.settings };
      const replacement = freshState();
      replacement.settings = settings;
      Object.keys(state).forEach((key) => { delete state[key]; });
      Object.assign(state, replacement);
      save(true);
      emit({ type: 'mission', phase: 'reset', mission: getMission(), text: 'Новая экспедиция готова к старту.', reward: 0 });
      return true;
    },
    accept() {
      if (!state.started || state.active || state.missionIndex >= MAX_MISSION_INDEX) return false;
      state.active = true;
      state.progress = 0;
      save();
      emit({ type: 'mission', phase: 'accepted', mission: getMission(), text: `Принят контракт «${getMission().title}».`, reward: 0 });
      return true;
    },
    arrive(targetKey) {
      if (!state.started || !isBody(targetKey)) return false;
      let newlyVisited = false;
      if (!state.visited.includes(targetKey)) {
        state.visited.push(targetKey);
        newlyVisited = true;
      }
      const mission = getMission();
      if (state.active && mission.kind === 'delivery' && mission.target === targetKey) return complete(mission);
      if (newlyVisited) save();
      return false;
    },
    scan(dt, { targetKey, near = false, stable = false } = {}) {
      const mission = getMission();
      if (!state.started || !state.active || mission.kind !== 'scan' || mission.target !== targetKey || !near || !stable) {
        state.progress = 0;
        return false;
      }
      if (!finite(dt, 0, 600) || dt === 0) return false;
      state.progress = Math.min(1, state.progress + dt / getScanDuration());
      if (state.progress >= 1 - 1e-9) return complete(mission);
      return false;
    },
    salvage(count) {
      if (!state.started || !integer(count, 1, 100)) return 0;
      const reward = Math.min(count * 12, MAX_CREDITS - state.credits);
      state.credits += reward;
      state.cargo = Math.min(MAX_CREDITS, state.cargo + count);
      save();
      emit({ type: 'reward', text: `Подобрано контейнеров: ${count}. +${reward} кр.`, reward });
      return reward;
    },
    purchase(id) {
      if (!state.started) return false;
      const cost = getUpgradeCost(id);
      if (cost === null || state.credits < cost) return false;
      state.credits -= cost;
      state.upgrades[id] += 1;
      save();
      emit({ type: 'mission', phase: 'upgrade', upgrade: id, text: `${UPGRADES[id].title}: уровень ${state.upgrades[id]}.`, reward: 0 });
      return true;
    },
    setSetting(key, value) {
      if (!validSetting(key, value)) return false;
      if (state.settings[key] === value) return true;
      state.settings[key] = value;
      save();
      return true;
    },
    save: () => save(),
  };
  return api;
}
