import { createPilotStick } from './pilot-stick.js';

const icons = {
  audio: '<path d="M4 9h4l5-4v14l-5-4H4zM16 8a6 6 0 0 1 0 8m2.5-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6"/>',
  exit: '<path d="M10 4H5v16h5m-1-8h12m-5-5 5 5-5 5"/>',
  play: '<path d="M8 4.5v15L20 12z"/>',
  rewind: '<path d="m8 8-5 5 5 5m-4-5h10a5 5 0 0 0 0-10"/>',
  receiver: '<path d="M2 14h3l2-4 3 7 4-13 3 15 2-6h3"/>',
};
const channels = [
  { id:'a', name:'Маяк', beats:1, cue:'Один импульс' },
  { id:'b', name:'Створ', beats:2, cue:'Два импульса' },
  { id:'c', name:'Кромка', beats:3, cue:'Три импульса' },
];
function icon(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
}
function pips(count) {
  return '<span class="last-pips" aria-hidden="true">' + '<i></i>'.repeat(count) + '</span>';
}
function tool(action, glyph, label) {
  return '<button type="button" class="last-tool" data-action="' + action + '" aria-label="' + label + '" title="' + label + '">' + icon(glyph) + '</button>';
}
function set(node, text) {
  if (node.textContent !== text) node.textContent = text;
}
const cap = value => Math.max(-1, Math.min(1, value));

export function createLastUI(parent, handlers) {
  const root = document.createElement('section');
  root.className = 'last-screen';
  root.setAttribute('aria-label','Экспедиция «Обратный свет»');
  root.innerHTML = `
    <header class="last-header">
      <div class="last-wordmark">${icon('receiver')} <span>Orbit Escape</span></div>
      <h1>Обратный свет</h1>
      <div class="last-tools">${tool('mute','audio','Выключить звук')}${tool('exit','exit','В ангар')}</div>
    </header>
    <div class="last-view">
      <canvas tabindex="0" aria-label="Панорама полёта. Во время перехода веди корабль стиком, мышью или стрелками."></canvas>
      <div class="last-toast" role="status" data-ref="toast" hidden></div>
    </div>
    <section class="last-deck" aria-label="Пульт навигации">
      <div class="last-brief">
        <div class="last-channel"><i aria-hidden="true"></i><span data-ref="source"></span></div>
        <h2 data-ref="title"></h2>
        <p data-ref="hint"></p>
        <p class="last-survey" data-ref="survey" hidden>В свободном полёте появилась обсерватория.</p>
      </div>
      <div class="last-recorder" data-pane="tune">
        <div class="last-rx">
          <button type="button" class="last-listen" data-action="listen">${icon('play')} <span>Прослушать</span></button>
          <div class="last-rx-meter" aria-live="polite" aria-atomic="true">
            <span class="last-rx-label" data-ref="heard">Приёмник</span>
            <span class="last-rx-ticks" aria-hidden="true"><i></i><i></i><i></i></span>
          </div>
        </div>
        <div class="last-keys" role="group" aria-label="Клавиши позывных">
          ${channels.map(channel => `<button type="button" class="last-key" data-action="note-${channel.id}" aria-label="${channel.name}. ${channel.cue}">${pips(channel.beats)}<span>${channel.name}</span></button>`).join('')}
        </div>
        <div class="last-tx">
          <span class="last-tx-label">Твой ответ</span>
          <output class="last-entry" aria-live="polite" aria-label="Набранный позывной"></output>
          <button type="button" class="last-undo" data-action="clear" title="Стереть ответ" aria-label="Стереть ответ">${icon('rewind')}</button>
        </div>
      </div>
      <div class="last-flight-instrument" data-pane="fly" hidden>
        <div class="last-leg-label"><span>Створки перехода</span><strong data-ref="range"></strong></div>
        <div class="last-leg-meter" aria-hidden="true"><i></i><i></i><i></i></div>
        <span class="last-lock" data-ref="lock"></span>
      </div>
      <div class="last-home" data-pane="home" hidden>
        <button type="button" class="last-visit" data-action="visit">К обсерватории <span aria-hidden="true">→</span></button>
        <div class="last-return">
          <button type="button" data-action="replay">Повторить полёт</button>
          <button type="button" data-action="exit">В ангар&nbsp; →</button>
        </div>
      </div>
    </section>
    <div class="pilot-stick-zone" data-ref="stick" hidden></div>`;
  parent.append(root);

  const canvas = root.querySelector('canvas');
  const refs = Object.fromEntries(Array.from(root.querySelectorAll('[data-ref]'), node => [node.dataset.ref,node]));
  const coarse = matchMedia('(pointer:coarse), (hover:none)');
  const pilot = createPilotStick(refs.stick, (x,y)=>handlers.stick?.(x,y));
  const panes = Array.from(root.querySelectorAll('[data-pane]'));
  const entry = root.querySelector('.last-entry');
  const noteKeys = Array.from(root.querySelectorAll('.last-key'));
  const listen = root.querySelector('[data-action=listen]');
  const undo = root.querySelector('[data-action=clear]');
  const soundButton = root.querySelector('[data-action=mute]');
  const ticks = Array.from(root.querySelectorAll('.last-rx-ticks i'));
  const legs = Array.from(root.querySelectorAll('.last-leg-meter i'));
  let phase = '', muted, drag = null, toastTimer = 0, alive = true;

  function showReceiver(model) {
    const playingIndex = Number.isInteger(model.playingIndex) ? model.playingIndex : -1;
    const current = channels.find(channel => channel.id === model.playingNote);
    const playing = playingIndex >= 0 && playingIndex < 3;
    listen.disabled = playing;
    set(listen.querySelector('span'), playing ? 'Идёт приём' : 'Прослушать');
    set(refs.heard, current && playing ? 'В эфире · ' + current.name : 'Приёмник');
    for (let i=0; i<ticks.length; i++) ticks[i].classList.toggle('lit', playing && i <= playingIndex);
    for (let i=0; i<noteKeys.length; i++) {
      const key = noteKeys[i];
      key.classList.toggle('last-voice', playing && current?.id === channels[i].id);
      key.disabled = playing;
    }
    const notes = Array.isArray(model.entry) ? model.entry.slice(0,3) : [];
    const entryText = Array.from({length:3}, (_,i) => channels.find(channel => channel.id === notes[i])?.name ?? '—');
    set(entry, entryText.join('  ·  '));
    undo.disabled = !notes.length || playing;
  }

  function update(model={}) {
    if (!alive) return;
    const next = ['tune','fly','home'].includes(model.phase) ? model.phase : 'tune';
    if (phase !== next) {
      pilot.release();
      phase=next;
      refs.stick.hidden=phase!=='fly';
      root.dataset.phase=phase;
      for (const pane of panes) pane.hidden=pane.dataset.pane!==phase;
      refs.survey.hidden=phase!=="home";
    }
    if (muted !== Boolean(model.muted)) {
      muted=Boolean(model.muted);
      const label=muted?'Включить звук':'Выключить звук';
      soundButton.innerHTML=icon(muted?'mute':'audio');
      soundButton.setAttribute('aria-label',label);
      soundButton.title=label;
      soundButton.setAttribute('aria-pressed',String(!muted));
    }
    if (phase==='tune') {
      set(refs.source,model.choice==='people'?'Архив механика «Створа»':'Архив ретранслятора');
      set(refs.title,'Восстанови позывной');
      set(refs.hint,'Прослушай три сигнала и повтори их по порядку. В эфире загорается соответствующая клавиша.');
      showReceiver(model);
    } else if (phase==='fly') {
      const leg=Math.max(0,Math.min(2,Number(model.leg)||0));
      const progress=Math.max(0,Math.min(1,Number(model.progress)||0));
      set(refs.source,'Коридор к обсерватории');
      set(refs.title,'Пройди через светлое кольцо');
      set(refs.hint,coarse.matches ? 'Сдвинь стик к кольцу. Отпусти, чтобы удержать курс.' : 'Веди прицел мышью или стрелками. Совмести его с кольцом до прохода.');
      set(refs.range,(leg+1)+' из 3');
      set(refs.lock,model.aligned?'Курс совпал':'Наведи корабль на кольцо');
      refs.lock.classList.toggle('last-lock-ok',Boolean(model.aligned));
      for (let i=0;i<legs.length;i++) {
        legs[i].classList.toggle('last-leg-done',i<leg);
        legs[i].style.setProperty('--fill',100*(i<leg?1:i===leg?progress:0)+'%');
      }
    } else {
      set(refs.source,model.choice==='people'?'Механик «Створа»':'Ретранслятор «Кромки»');
      set(refs.title,'Обсерватория на связи');
      set(refs.hint,model.choice==='people'
        ? '«Вижу свет в куполе. Оставь приёмник включённым — мы дождёмся первого челнока».'
        : 'Купол разворачивается к пристани. По открытому тобой каналу обсерватория передаёт челноку координаты дома.');
    }
  }

  function aim(event) {
    const bounds=canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    handlers.steer?.(cap(2*(event.clientX-bounds.left)/bounds.width-1),cap(2*(event.clientY-bounds.top)/bounds.height-1));
  }
  canvas.addEventListener('pointerdown', event => {
    if (phase!=='fly' || event.pointerType==='touch' || event.button!==0 || drag!==null) return;
    event.preventDefault();
    drag=event.pointerId;canvas.focus({preventScroll:true});
    canvas.setPointerCapture?.(drag);aim(event);
  });
  canvas.addEventListener('pointermove', event => {
    if (drag===event.pointerId && phase==='fly') aim(event);
  });
  function release(event) {
    if (event.pointerId===drag) drag=null;
  }
  for (const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type,release);
  root.addEventListener('click',event=>{
    const target=event.target.closest('button[data-action]');
    if (target && !target.disabled) handlers.action?.(target.dataset.action);
  });
  function toast(message) {
    if (!alive) return;
    refs.toast.textContent=message;
    refs.toast.hidden=false;
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{refs.toast.hidden=true;},2500);
  }
  update();
  return {canvas,update,toast,destroy() {
    alive=false;pilot.destroy();
    clearTimeout(toastTimer);
    if (drag!==null && canvas.hasPointerCapture?.(drag)) canvas.releasePointerCapture(drag);
    root.remove();
  }};
}
