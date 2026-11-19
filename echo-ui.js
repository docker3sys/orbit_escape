import { createPilotStick } from './pilot-stick.js';

const pictures = {
  signal: '<path d="M2 15h3l2-8 3 13 3-17 3 14 2-7 2 5h2"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4zM16 8a6 6 0 0 1 0 8m2.5-11a10 10 0 0 1 0 14"/>',
  silent: '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6"/>',
  exit: '<path d="M10 5H5v14h5m-1-7h12m-5-5 5 5-5 5"/>',
  capture: '<circle cx="12" cy="12" r="4"/><path d="M8 3H4v4m12-4h4v4M4 17v4h4m12-4v4h-4"/>',
  route: '<circle cx="5" cy="17" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 16.5c5-1 1-8 8-9l2-.5"/>',
  replay: '<path d="M4 9a8.5 8.5 0 1 1-.2 6M4 4v5h5"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pictures[name]}</svg>`;
}

function toolbarButton(action, name, label) {
  return `<button type="button" class="echo-tool" data-action="${action}" title="${label}" aria-label="${label}">${icon(name)}</button>`;
}

function meter(id, name) {
  return `<div class="echo-meter-row echo-${id}" data-channel="${id}">
    <div class="echo-channel-name"><span class="echo-key">${id.toUpperCase()}</span><span>${name}</span></div>
    <div class="echo-meter" role="meter" aria-label="Уровень сигнала ${name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
    <span class="echo-reading"></span>
  </div>`;
}

function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

const dispatch = {
  people: 'Механик «Створа» · Два голоса в эфире',
  relay: 'Ретранслятор «Кромки» · Два сигнала в эфире',
};

export function createEchoUI(parent, handlers) {
  const root = document.createElement('section');
  root.className = 'echo-screen';
  root.setAttribute('aria-label', 'Экспедиция «Два голоса»');
  root.innerHTML = `
    <header class="echo-header">
      <div class="echo-brand">${icon('signal')} <span>Orbit Escape</span></div>
      <h1>Два голоса</h1>
      <div class="echo-tools">
        ${toolbarButton('mute','volume','Выключить звук')}
        ${toolbarButton('exit','exit','В ангар')}
      </div>
    </header>
    <div class="echo-map">
      <canvas tabindex="0" aria-label="Орбитальная карта. На телефоне управляй кораблём нижним штурвалом. Точка на карте задаёт курс. На клавиатуре используй стрелки."></canvas>
      <div class="echo-toast" data-ref="toast" role="status" aria-live="polite" hidden></div>
    </div>
    <section class="echo-dock" aria-label="Бортовой приёмник">
      <div class="pilot-stick-zone echo-stick" data-ref="stick" aria-label="Штурвал"></div>
      <div class="echo-objective">
        <div class="echo-eyeline"><span class="echo-status-dot"></span><span data-ref="source"></span></div>
        <h2 data-ref="objective"></h2>
        <p data-ref="instructions"></p>
      </div>
      <div class="echo-receiver" data-ref="receiver">
        <div class="echo-channels">${meter('a','Створ')}${meter('b','Дальний буй')}</div>
        <button class="echo-primary echo-record" type="button" data-action="capture" disabled>${icon('capture')}<span>Записать сигнал</span></button>
      </div>
      <div class="echo-gate" data-ref="gate" hidden>
        <span data-ref="range"></span>
        <button class="echo-primary echo-course" type="button" data-action="gate-course">${icon('route')}<span>Лечь на курс</span></button>
      </div>
      <div class="echo-end" data-ref="end" hidden>
        <button class="echo-primary" type="button" data-action="last">Обратный свет <span aria-hidden="true">→</span></button>
        <div class="echo-endnav"><button type="button" data-action="replay">${icon('replay')} Повторить</button><button type="button" data-action="exit">В ангар</button></div>
      </div>
    </section>`;
  parent.append(root);

  const ref = Object.fromEntries([...root.querySelectorAll('[data-ref]')].map(el => [el.dataset.ref, el]));
  const canvas = root.querySelector('canvas');
  const stick = createPilotStick(ref.stick, (x,y) => handlers.steer?.(x,y));
  const course = root.querySelector('[data-action=gate-course]');
  const mute = root.querySelector('[data-action=mute]');
  const capture = root.querySelector('[data-action=capture]');
  const recordLabel = capture.querySelector('span');
  const channels = {};
  for (const row of root.querySelectorAll('[data-channel]')) {
    channels[row.dataset.channel] = {
      row,
      level: row.querySelector('.echo-meter'),
      fill: row.querySelector('.echo-meter i'),
      reading: row.querySelector('.echo-reading'),
      value: -1,
    };
  }
  let phase = 'listen';
  let lastMute;
  let dragPointer = null;
  let live = true;
  let timeout;
  const touch = matchMedia('(any-pointer: coarse)');

  function updateChannel(name, value, logged, isolated, shadowed) {
    const channel = channels[name];
    const percent = Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
    if (channel.value !== percent) {
      channel.fill.style.transform = `scaleX(${percent / 100})`;
      channel.level.setAttribute('aria-valuenow', String(percent));
      channel.value = percent;
    }
    channel.row.classList.toggle('echo-isolated', isolated && !logged);
    channel.row.classList.toggle('echo-logged', logged);
    setText(channel.reading, logged ? 'Записан' : isolated ? 'Чистый' : shadowed ? 'В тени' : percent + '%');
  }

  function update(model = {}) {
    if (!live) return;
    const nextPhase = model.phase || 'listen';
    if (phase !== nextPhase) stick.release();
    phase = nextPhase;
    const isListening = phase === 'listen';
    const hasA = !!model.samples?.a;
    const hasB = !!model.samples?.b;
    const isPeople = model.choice === 'people';
    const canCapture = isListening && ((model.canCapture === 'a' && !hasA) || (model.canCapture === 'b' && !hasB))
      ? model.canCapture : null;
    const isIntro = isListening && !hasA && !hasB;
    root.dataset.phase = phase;
    root.classList.toggle('echo-reduced', Boolean(model.reducedMotion));
    if (lastMute !== !!model.muted) {
      lastMute = !!model.muted;
      const label = lastMute ? 'Включить звук' : 'Выключить звук';
      mute.innerHTML = icon(lastMute ? 'silent' : 'volume');
      mute.title = label;
      mute.setAttribute('aria-label', label);
      mute.setAttribute('aria-pressed', String(!lastMute));
    }
    ref.receiver.hidden = !isListening;
    ref.gate.hidden = phase !== 'gate';
    ref.end.hidden = phase !== 'arrived';
    ref.stick.hidden = phase === 'arrived';
    if (isListening) {
      const source = dispatch[isPeople ? 'people' : 'relay'];
      setText(ref.source, isIntro ? source : 'Бортовой приёмник');
      setText(ref.objective, canCapture ? 'Слышу ' + canCapture.toUpperCase() :
        hasA ? 'Найди голос B' : hasB ? 'Найди голос A' : 'Раздели два сигнала');
      const help = canCapture ? 'Сигнал чистый. Запиши позывной.' :
        hasA ? 'Веди корабль в янтарный сектор за станцией.' :
        hasB ? 'Веди корабль в бирюзовый сектор за станцией.' :
        touch.matches ? 'Штурвалом веди корабль в один из цветных секторов.' :
        'Задай курс щелчком или веди стрелками в цветной сектор.';
      setText(ref.instructions, help);
      updateChannel('a', model.a, hasA, canCapture === 'a', model.occludedA);
      updateChannel('b', model.b, hasB, canCapture === 'b', model.occludedB);
      capture.disabled = !canCapture;
      setText(recordLabel, canCapture ? 'Записать ' + canCapture.toUpperCase() : 'Записать сигнал');
    } else if (phase === 'gate') {
      setText(ref.source, 'Оба позывных записаны');
      setText(ref.objective, 'Подведи корабль к норе');
      setText(ref.instructions, 'Веди к светлому кольцу или проложи курс.');
      const distance = Number(model.targetDistance);
      setText(ref.range, Number.isFinite(distance) ? Math.ceil(Math.max(0, distance)) + ' ед. до прохода' : 'Координаты определены');
      course.disabled = !!model.onGateCourse;
      setText(course.querySelector('span'), model.onGateCourse ? 'Идём к кольцу' : 'Лечь на курс');
    } else if (phase === 'arrived') {
      setText(ref.source, 'Маршрут открыт');
      setText(ref.objective, 'Первый рейс на линии');
      setText(ref.instructions, isPeople
        ? 'Первый челнок вышел с «Кромки» к норе. Со «Створа» отвечает механик. В журнале челнока остались три коротких импульса «Кромки».'
        : 'Ретранслятор ведёт первый челнок от «Кромки» к норе. В журнале челнока остались три коротких импульса «Кромки».');
    }
  }

  function aim(event) {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const clip = f => Math.max(0, Math.min(1, f));
    handlers.moveTo?.(clip((event.clientX - bounds.left)/bounds.width), clip((event.clientY - bounds.top)/bounds.height));
  }
  canvas.addEventListener('pointerdown', event => {
    if (phase === 'arrived' || event.button !== 0 || dragPointer !== null) return;
    event.preventDefault();
    dragPointer = event.pointerId;
    canvas.setPointerCapture?.(dragPointer);
    canvas.focus({preventScroll:true});
    aim(event);
  });
  canvas.addEventListener('pointermove', event => {
    if (dragPointer === event.pointerId && phase !== 'arrived') aim(event);
  });
  function release(event) {
    if (dragPointer === event.pointerId) dragPointer = null;
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, release);
  root.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (button && !button.disabled) handlers.action?.(button.dataset.action);
  });
  function toast(message) {
    if (!live) return;
    clearTimeout(timeout);
    setText(ref.toast, message);
    ref.toast.hidden = false;
    timeout = setTimeout(() => { ref.toast.hidden = true; }, 2400);
  }
  update();
  return {canvas, root, update, toast, release:stick.release, destroy() {
    stick.destroy();
    live = false;
    clearTimeout(timeout);
    if (dragPointer !== null && canvas.hasPointerCapture?.(dragPointer)) canvas.releasePointerCapture(dragPointer);
    root.remove();
  }};
}
