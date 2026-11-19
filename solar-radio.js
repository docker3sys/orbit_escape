// The receiver hears these three short phrases separately. Back at Earth they form a chord.
const RADIO_KEY = "orbit-escape/solar-radio/1";
const stations = [
  {key:"earth", place:"Земля", clue:"У Земли слышен обрывок передачи.", line:"«Сатурн, здесь Земля. Как слышите?»", notes:[146.83, 220, 293.66], timbre:"sine"},
  {key:"saturn", place:"Сатурн", clue:"Следующая частота у колец Сатурна.", line:"«Слышу Землю. Передаю дальше, первому Вояджеру».", notes:[174.61, 220, 349.23], timbre:"triangle"},
  {key:"voyager1", place:"Voyager 1", clue:"Ищи последний позывной у Voyager 1.", line:"«Вояджер слышит. Отправляю ответ домой».", notes:[196, 293.66, 392], timbre:"sine"},
  {key:"earth", place:"Земля", clue:"У Земли ждут ответ Вояджера.", line:"«Земля на связи. Теперь слышно всех троих».", notes:[146.83, 174.61, 220, 293.66], timbre:"sine"},
];

function readProgress() {
  try {
    const value = Number(localStorage.getItem(RADIO_KEY));
    if (Number.isInteger(value) && value >= 0 && value <= stations.length) return value;
  } catch {}
  return 0;
}

function createReceiverSound() {
  let context, main, hum, body, filter, air;
  let audible = false;
  let suspendTimer = 0;
  const voices = new Set();

  function open() {
    if (!context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      context = new Audio();
      main = context.createGain();
      main.gain.value = 0;
      main.connect(context.destination);
      body = context.createGain();
      body.gain.value = .036;
      body.connect(main);
      hum = context.createOscillator();
      hum.type = "triangle";
      hum.frequency.value = 65.41;
      hum.connect(body);
      hum.start();
      const length = Math.round(context.sampleRate * 2);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const samples = buffer.getChannelData(0);
      let smooth = 0;
      for (let i = 0; i < length; i++) {
        smooth = .94 * smooth + .06 * (Math.random() * 2 - 1);
        // Cross both ends of the loop at silence.
        samples[i] = smooth * Math.min(1, i / 700, (length - 1 - i) / 700);
      }
      const noise = context.createBufferSource();
      filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 270;
      air = context.createGain();
      air.gain.value = .033;
      noise.buffer = buffer;
      noise.loop = true;
      noise.connect(filter).connect(air).connect(main);
      noise.start();
    }
    clearTimeout(suspendTimer);
    audible = true;
    if (context.state !== "running") context.resume().catch(() => {});
    main.gain.cancelScheduledValues(context.currentTime);
    main.gain.setTargetAtTime(.72, context.currentTime, .09);
  }
  function hush() {
    audible = false;
    clearTimeout(suspendTimer);
    if (!context) return;
    for (const tone of voices) {
      try { tone.stop(context.currentTime + .08); } catch {}
    }
    main.gain.cancelScheduledValues(context.currentTime);
    main.gain.setTargetAtTime(0, context.currentTime, .018);
    suspendTimer = setTimeout(() => {
      if (!audible && context.state === "running") context.suspend().catch(() => {});
    }, 150);
  }
  function note(frequency, when, duration, level, timbre, slideTo) {
    if (!audible || context?.state !== "running") return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = timbre;
    oscillator.frequency.setValueAtTime(frequency, when);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, when + duration);
    envelope.gain.setValueAtTime(.0001, when);
    envelope.gain.exponentialRampToValueAtTime(level, when + .045);
    envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
    oscillator.connect(envelope).connect(main);
    oscillator.onended = () => {
      voices.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    voices.add(oscillator);
    oscillator.start(when);
    oscillator.stop(when + duration + .03);
  }
  return {
    open, hush,
    update(speed) {
      if (!audible || !context) return;
      const now = context.currentTime;
      hum.frequency.setTargetAtTime(65.41 + 33 * speed, now, .32);
      body.gain.setTargetAtTime(.036 + .039 * speed, now, .28);
      filter.frequency.setTargetAtTime(270 + 1300 * speed, now, .33);
      air.gain.setTargetAtTime(.033 + .14 * speed, now, .27);
    },
    jump() {
      if (!audible || !context) return;
      const now = context.currentTime;
      note(76, now, .72, .074, "sine", 185);
      note(246.94, now + .09, .84, .033, "sine", 82.41);
    },
    receive(station, resolved) {
      if (!audible || !context) return;
      const now = context.currentTime;
      station.notes.forEach((hz, index) => {
        const onset = now + index * (resolved ? .19 : .32);
        note(hz, onset, resolved ? 2.4 : .91, .095, station.timbre);
        note(hz * 2, onset + .12, 1.1, .019, "sine");
      });
    },
  };
}

export function createSolarRadio({telemetry, signal, log}) {
  const sound = createReceiverSound();
  const sky = document.querySelector("#game");
  const fold = document.createElement("div");
  fold.className = "solar-fold";
  fold.setAttribute("aria-hidden", "true");
  sky.querySelector(".vignette").before(fold);

  let running = false, muted = false, timer = 0;
  let progress = readProgress();
  let listened = 0, lastTick = 0, lastJump = null;
  let captionUntil = 0, listening = false;

  function show(line, seconds) {
    if (!signal) return;
    signal.textContent = line;
    signal.hidden = !line;
    captionUntil = performance.now() + seconds * 1000;
  }
  function describe() {
    if (!log) return;
    const station = stations[progress];
    log.textContent = station ? "Эфир · " + station.clue : "Эфир · Земля, Сатурн и Voyager 1 снова на связи.";
  }
  function openSound() {
    if (!muted) { try { sound.open(); } catch {} }
  }
  function tick() {
    const now = performance.now();
    const dt = Math.min(.35, (now - lastTick) / 1000);
    lastTick = now;
    if (!running || document.hidden) return;
    const state = telemetry();
    if (!state) return;
    if (lastJump !== null && lastJump !== state.jump) {
      sound.jump();
      fold.classList.remove("is-jumping");
      void fold.offsetWidth;
      fold.classList.add("is-jumping");
      listened = 0;
    }
    lastJump = state.jump;
    sound.update(Math.max(0, Math.min(1, state.speed || 0)));
    if (signal && !signal.hidden && now >= captionUntil) show("", 0);
    const station = stations[progress];
    const inRange = station && state.target === station.key && state.near >= .68;
    if (!inRange) {
      listened = 0;
      if (listening) show("", 0);
      listening = false;
      return;
    }
    if (!listening) {
      show("Приём · " + station.place, 3);
      listening = true;
    }
    listened += dt;
    if (listened < 2.25) return;
    listened = 0;
    listening = false;
    progress++;
    try { localStorage.setItem(RADIO_KEY, String(progress)); } catch {}
    describe();
    sound.receive(station, progress === stations.length);
    show(station.line, 6);
  }
  describe();
  return {
    start(value) {
      muted = value;
      if (running) return;
      running = true;
      lastTick = performance.now();
      lastJump = null;
      openSound();
      // Some mobile browsers require an additional foreground tap after a screen lock.
      sky.addEventListener("pointerdown", openSound, {passive:true});
      timer = window.setInterval(tick, 150);
    },
    stop() {
      running = false;
      window.clearInterval(timer);
      sky.removeEventListener("pointerdown", openSound);
      listened = 0;
      listening = false;
      fold.classList.remove("is-jumping");
      show("", 0);
      sound.hush();
    },
    setMuted(value) {
      muted = value;
      if (muted) sound.hush(); else if (running) openSound();
    },
  };
}
