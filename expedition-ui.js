import { createPilotStick } from './pilot-stick.js';

const HUD_ICONS = {
  audible: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8a6 6 0 0 1 0 8m2.5-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m17 9 5 6m0-6-5 6"/>',
  exit: '<path d="M10 5H5v14h5m-1-7h12m-5-5 5 5-5 5"/>',
  wave: '<path d="M2 12h4l2-6 4 12 3-15 2 12 2-3h3"/>',
  check: '<path d="m4.5 12 5 5 10-11"/>',
  next: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  chevron: '<path d="m6 14 6-6 6 6"/>',
  thrust: '<path d="m4 17 8-12 8 12-8-3zM9 20h6"/>',
  brake: '<path d="M8 6v12m8-12v12"/>',
  people: '<circle cx="9" cy="9" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m0-14a3 3 0 0 1 0 6m2 2a5 5 0 0 1 4 5"/>',
  relay: '<path d="m8 21 4-10 4 10m-6-4h4"/><circle cx="12" cy="8" r="1"/><path d="M8.5 4.5a5 5 0 0 0 0 7m7-7a5 5 0 0 1 0 7M6 2a8.5 8.5 0 0 0 0 12m12-12a8.5 8.5 0 0 1 0 12"/>',
  save: '<path d="M4 3h13l3 3v15H4z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${HUD_ICONS[name] || ''}</svg>`;

const FLIGHT_STAGES = {
  scan: { label: 'Дальний приём', title: 'Найди источник сигнала', instruction: 'Поворачивай корабль. Чем ближе источник к центру, тем сильнее ответ.', action: 'Поймать сигнал', place: 'У Voyager 1' },
  gate: { label: 'Вход в нору', title: 'Поймай длинный импульс', instruction: 'Наведи прицел на кольцо и дай тягу, пока оно раскрыто.', action: 'Войти в нору', place: 'Кротовая нора' },
  approach: { label: 'Сближение', title: 'Дойди до «Кромки»', instruction: 'Следи за буями и держи курс на станцию у диска.', action: 'Стыковка', place: 'Окрестности «Кромки»' },
  deliver: { label: 'Рейс буксира', title: 'Доставь груз', instruction: 'Поверни к метке и удерживай тягу до точки назначения.', action: 'Доставить', place: 'Линия буксира' },
  return: { label: 'Обратный путь', title: 'Вернись к Voyager 1', instruction: 'Найди кольцо, пройди по знакомому позывному и услышь ответ.', action: 'Вернуться', place: 'Обратный маршрут' },
};

const TOUCH_HINTS = {
  scan:'Сдвинь стик в сторону янтарной метки. Отпусти, когда она окажется в прицеле.',
  gate:'Совмести метку с прицелом и включи тягу. Корабль войдёт в открытый створ.',
  approach:'Включи тягу и держи метку станции в прицеле.',
  deliver:'Включи тягу и держи курс на метку.',
  return:'Совмести метку с прицелом и включи тягу, чтобы вернуться.',
};

function toolbarButton(action, name, label) {
  return `<button type="button" class="oe-tool" data-action="${action}" title="${label}" aria-label="${label}">${icon(name)}</button>`;
}
function steerButton(key, label) {
  return `<button type="button" class="oe-turn oe-${key}" data-control="${key}" aria-label="${label}" title="${label}">${icon('chevron')}</button>`;
}
function command(action, label, variant = 'major', glyph = 'next') {
  return `<button type="button" class="oe-cmd oe-${variant}" data-action="${action}">${glyph ? icon(glyph) : ''}<span>${label}</span></button>`;
}

export function createExpeditionUI(parent, callbacks = {}) {
  const root = document.createElement('section');
  root.className = 'oe-expedition';
  root.setAttribute('aria-label', 'Экспедиция «Тихий маяк»');
  const bars = Array.from({length: 24}, (_, index) => `<i style="--height:${4 + Math.round(12 * index / 23)}px"></i>`).join('');
  root.innerHTML = `
    <canvas class="oe-space" tabindex="-1" aria-label="Вид из кабины. Перетаскивай, чтобы повернуть корабль."></canvas>
    <div class="oe-edge" aria-hidden="true"></div>
    <header class="oe-head">
      <div class="oe-place"><span class="oe-radio-led" aria-hidden="true"></span><span class="oe-brand">ORBIT ESCAPE</span><span class="oe-place-divider" aria-hidden="true"></span><span data-ref="place">Тихий маяк</span></div>
      <div class="oe-tools">${toolbarButton('mute','audible','Выключить звук')}${toolbarButton('exit','exit','Выйти из экспедиции')}</div>
    </header>
    <section class="oe-flight" data-ref="flight" hidden>
      <div class="oe-sight" data-ref="sight" aria-hidden="true"><i class="oe-bracket"></i><i class="oe-dot"></i><i class="oe-mark" data-ref="bearing"></i></div>
      <div class="pilot-stick-zone" data-ref="stick"></div>
      <button class="oe-cruise" type="button" data-action="cruise" aria-pressed="false">${icon('thrust')}<span>Дать тягу</span></button>
      <div class="oe-console">
        <div class="oe-navpad" role="group" aria-label="Поворот корабля">
          ${steerButton('up','Нос вверх')}${steerButton('left','Поворот влево')}${steerButton('right','Поворот вправо')}${steerButton('down','Нос вниз')}
        </div>
        <div class="oe-objective">
          <div class="oe-phase"><span class="oe-channel" data-ref="phase"></span><span data-ref="distance"></span></div>
          <h2 data-ref="title"></h2><p data-ref="instruction"></p>
          <div class="oe-scan" data-ref="scan"><span>Приём</span><span class="oe-meter" data-ref="meter" aria-hidden="true">${bars}</span><output data-ref="strength"></output><span class="oe-pulse" data-ref="pulse"></span></div>
        </div>
        <div class="oe-maneuver"><div class="oe-drivebuttons">
          <button type="button" class="oe-brake" data-control="brake" title="Тормоз" aria-label="Тормоз">${icon('brake')}</button>
          <button type="button" class="oe-thrust" data-control="thrust">${icon('thrust')}<span>Тяга</span></button>
        </div>${command('interact','Действие','interact','next')}</div>
      </div>
    </section>
    <div class="oe-panel" data-ref="panel" hidden><section class="oe-panel-card" data-ref="card" tabindex="-1" role="dialog" aria-modal="false" aria-labelledby="oe-dialog-title"></section></div>
    <div class="oe-toast" data-ref="toast" role="status" aria-live="polite" hidden></div>`;
  parent.append(root);
  const ref = Object.fromEntries(Array.from(root.querySelectorAll('[data-ref]'), el => [el.dataset.ref, el]));
  const canvas = root.querySelector('canvas');
  const coarse = matchMedia('(pointer:coarse), (hover:none)');
  const pilot = createPilotStick(ref.stick, (x,y) => callbacks.stick?.(x,y));
  const cruiseButton = root.querySelector('.oe-cruise');
  let cruising = false, cruisePointer = null;
  function setCruise(on) {
    if (on === cruising) return;
    cruising = on;
    callbacks.control?.('thrust',on);
    cruiseButton.setAttribute('aria-pressed',String(on));
    cruiseButton.querySelector('span').textContent = on ? 'Сбросить тягу' : 'Дать тягу';
  }

  const interactLabel = root.querySelector('[data-action="interact"] span');
  const muteButton = root.querySelector('[data-action="mute"]');
  const meterBars = Array.from(ref.meter.children);
  const held = new Map();
  let dragPointer, model = {}, stageToken = '', confirmedRestart = false, toastTimer, lastMute, lastLevel = -1;
  let active = true;

  function toast(message) {
    if (!active) return;
    ref.toast.textContent = message;
    ref.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ref.toast.hidden = true; }, 2300);
  }

  function renderPanel(stage, saved, choice) {
    let html = '';
    if (confirmedRestart) {
      html = `<div class="oe-tag">${icon('save')} Бортовой журнал</div><h1 id="oe-dialog-title">Начать заново?</h1><p>Новый рейс заменит запись этой экспедиции.</p><div class="oe-actions">${command('cancel-new','Остаться','major',null)}${command('confirm-new','Начать заново','quiet',null)}</div>`;
    } else if (stage === 'welcome') {
      html = `<div class="oe-tag">${icon('wave')} Экспедиция</div><h1 id="oe-dialog-title">Тихий маяк</h1><p>У Voyager 1 сквозь помехи слышен ответ. Его источник прячется в пустом участке неба.</p>
       <div class="oe-brief">${icon('thrust')}<span>${coarse.matches ? 'Сдвинь стик, чтобы повернуть корабль. Отпусти его, чтобы удержать курс.' : 'Проведи по небу или нажимай стрелки, чтобы повернуть корабль. Для полёта удерживай «Тяга». '}</span></div>
       <div class="oe-actions">${saved ? command('resume','Продолжить рейс')+command('new','Начать заново','quiet',null) : command('new','Начать экспедицию')}</div>`;
    } else if (stage === 'choice') {
      html = `<div class="oe-tag">${icon('wave')} Станция «Кромка»</div><h1 id="oe-dialog-title">На один рейс</h1><p>На станции 18 жителей. Заряда буксира хватит на один перелёт с грузом. Кого или что возьмём на борт?</p>
      <div class="oe-choices">
        <button type="button" data-action="people">${icon('people')}<span><b>Шесть добровольцев</b><small>Доставить людей на заброшенный пост «Створ».</small></span>${icon('next')}</button>
        <button type="button" data-action="relay">${icon('relay')}<span><b>Ретранслятор</b><small>Закрепить маяк у норы и продлить окно перехода.</small></span>${icon('next')}</button>
      </div>`;
    } else if (stage === 'complete') {
      const people = choice === 'people';
      html = `<div class="oe-tag">${icon('check')} Экспедиция завершена</div>
      <h1 id="oe-dialog-title">${people ? '«Створ» на связи' : 'Чистый эфир'}</h1><p>${people ? 'Шесть окон на заброшенном посту снова светятся. У Voyager слышны две короткие ноты нового позывного «Створа».' : 'Сквозь помехи пробивается одиночная нота ретранслятора. Установленный тобой маяк держит проход открытым дольше.'}</p>
      <div class="oe-tally"><div><small>Кромка</small><strong>${people ? '12' : '18'}</strong><span>жителей</span></div><div><small>Створ</small><strong>${people ? '6' : '0'}</strong><span>жителей</span></div><div><small>Радиомаяк</small><strong class="oe-tally-word">${people ? 'В резерве' : 'В эфире'}</strong></div></div>
      <div class="oe-actions">${command('echo','Далее · Два голоса','major','next')}${command('new','Пройти ещё раз','quiet',null)}</div>`;
    }
    ref.card.innerHTML = html;
    ref.panel.hidden = !html;
    ref.flight.hidden = Boolean(html);
    if (html) ref.card.focus({preventScroll:true});
  }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }
  function number01(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  }
  function update(nextModel) {
    model = nextModel || {};
    const stage = model.stage || 'welcome';
    const data = FLIGHT_STAGES[stage] || FLIGHT_STAGES.scan;
    const isPanel = ['welcome','choice','complete'].includes(stage);
    const key = [stage, Boolean(model.saved), model.choice, confirmedRestart].join('|');
    if (stageToken !== key) {
      stageToken = key;
      cruisePointer=null;
      setCruise(false);
      pilot.release();
      for (const [pointerId, key] of held) stopControl(pointerId, key);
      dragPointer = undefined;
      renderPanel(stage, Boolean(model.saved), model.choice);
      root.dataset.stage = stage;
    }
    root.classList.toggle('oe-reduced', !!model.reducedMotion);
    root.classList.toggle('oe-warping', !!model.warping);
    setText(ref.place, model.location || (isPanel ? 'Тихий маяк' : data.place));
    const muted = !!model.muted;
    if (muted !== lastMute) {
      const label = muted ? 'Включить звук' : 'Выключить звук';
      muteButton.innerHTML = icon(muted ? 'muted' : 'audible');
      muteButton.title = label; muteButton.setAttribute('aria-label', label);
      muteButton.setAttribute('aria-pressed', String(!muted));
      lastMute = muted;
    }
    if (isPanel || confirmedRestart) return;
    setText(ref.phase, model.warping ? 'Переход' : data.label);
    setText(ref.title, model.title || data.title);
    setText(ref.instruction, coarse.matches ? TOUCH_HINTS[stage] : (model.instruction || data.instruction));
    setText(interactLabel, model.actionLabel || data.action);
    const distance = typeof model.distance === 'number' && Number.isFinite(model.distance)
      ? `${Math.max(0, Math.round(model.distance))} ед.` : (typeof model.distance === 'string' ? model.distance : '');
    setText(ref.distance, distance);
    const showScan = ['scan','gate','return'].includes(stage);
    ref.scan.hidden = !showScan;
    const strength = number01(model.strength), level = Math.round(strength * meterBars.length);
    if (showScan) {
      setText(ref.strength, `${Math.round(strength*100)}%`);
      if (lastLevel !== level) {
        for (let i = 0; i < meterBars.length; i++) meterBars[i].classList.toggle('oe-lit', i < level);
        lastLevel = level;
      }
      const windowOpen = Boolean(model.windowOpen);
      setText(ref.pulse, windowOpen ? 'Окно открыто' : (stage === 'scan' ? 'Поиск' : 'Ждём импульс'));
      ref.pulse.classList.toggle('oe-open', windowOpen);
    }
    ref.sight.style.setProperty('--swell', String(number01(model.pulse)));
    ref.sight.classList.toggle('oe-aligned', Boolean(model.aligned));
    ref.sight.classList.toggle('oe-open', Boolean(model.windowOpen));
    const clamp = x => Math.max(-1, Math.min(1, Number(x) || 0));
    const x = clamp(model.bearingX), y = clamp(model.bearingY);
    ref.bearing.style.transform = `translate(calc(-50% + ${x*30}px),calc(-50% - ${y*30}px))`;
    ref.bearing.hidden = Boolean(model.warping);
  }

  root.addEventListener('click', e => {
    const button = e.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'cruise') {
      // Pointer activation is handled separately so a second thumb works while steering.
      if (e.detail === 0) toggleCruise();
      return;
    }
    if (action === 'new' && (model.saved || model.stage === 'complete')) {
      confirmedRestart = true; update(model); return;
    }
    if (action === 'cancel-new') { confirmedRestart = false; update(model); return; }
    if (action === 'confirm-new') { confirmedRestart = false; callbacks.action?.('new'); return; }
    callbacks.action?.(action);
  });

  function toggleCruise() {
    if (['gate','approach','deliver','return'].includes(model.stage)) setCruise(!cruising);
  }
  cruiseButton.addEventListener('pointerdown', e => {
    if (e.button !== 0 || cruisePointer !== null) return;
    e.preventDefault();
    cruisePointer = e.pointerId;
    cruiseButton.setPointerCapture(e.pointerId);
  });
  cruiseButton.addEventListener('pointerup', e => {
    if (cruisePointer !== e.pointerId) return;
    cruisePointer = null;
    const box = cruiseButton.getBoundingClientRect();
    if (e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom) toggleCruise();
  });
  for (const event of ['pointercancel','lostpointercapture']) cruiseButton.addEventListener(event, e => {
    if (cruisePointer === e.pointerId) cruisePointer=null;
  });
  function stopControl(pointerId, key) {
    held.delete(pointerId);
    if ([...held.values()].includes(key)) return;
    root.querySelector(`[data-control="${key}"]`)?.classList.remove('oe-pressed');
    callbacks.control?.(key, false);
  }
  function releaseAll() {
    cruisePointer=null;
    setCruise(false);
    pilot.release();
    for (const [id,key] of held) stopControl(id,key);
    dragPointer = undefined;
  }
  root.addEventListener('keydown', e => {
    const button = e.target.closest('[data-control]');
    if (!button || ![' ', 'Enter'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const key = button.dataset.control;
    const id = 'keyboard-' + e.code;
    if (held.has(id)) return;
    held.set(id, key);
    button.classList.add('oe-pressed');
    callbacks.control?.(key, true);
  });
  root.addEventListener('keyup', e => {
    const id = 'keyboard-' + e.code;
    if (!held.has(id)) return;
    e.preventDefault();
    e.stopPropagation();
    stopControl(id, held.get(id));
  });
  root.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const button = e.target.closest('[data-control]');
    if (button) {
      e.preventDefault(); button.setPointerCapture?.(e.pointerId);
      const key = button.dataset.control;
      held.set(e.pointerId,key); button.classList.add('oe-pressed');
      callbacks.control?.(key,true);
    } else if (e.target === canvas && dragPointer === undefined) {
      dragPointer = {id:e.pointerId, x:e.clientX, y:e.clientY};
      canvas.setPointerCapture?.(e.pointerId);
      canvas.focus({preventScroll:true});
    }
  });
  root.addEventListener('pointermove', e => {
    if (dragPointer?.id !== e.pointerId) return;
    const dx = e.clientX-dragPointer.x, dy = e.clientY-dragPointer.y;
    dragPointer.x=e.clientX; dragPointer.y=e.clientY;
    callbacks.look?.(dx,dy);
  });
  function release(e) {
    if (held.has(e.pointerId)) stopControl(e.pointerId,held.get(e.pointerId));
    if (dragPointer?.id === e.pointerId) dragPointer=undefined;
  }
  for (const event of ['pointerup','pointercancel','lostpointercapture']) root.addEventListener(event,release);
  window.addEventListener('blur',releaseAll);
  document.addEventListener('visibilitychange',releaseAll);
  document.addEventListener('freeze',releaseAll);
  window.addEventListener('pagehide',releaseAll);
  update({stage:'welcome'});
  return {canvas, root, update, toast, destroy() {
    active=false; releaseAll(); pilot.destroy(); clearTimeout(toastTimer);
    window.removeEventListener('blur',releaseAll);
    document.removeEventListener('visibilitychange',releaseAll);
    document.removeEventListener('freeze',releaseAll);
    window.removeEventListener('pagehide',releaseAll);
    root.remove();
  }};
}
