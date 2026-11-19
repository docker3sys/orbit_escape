// A felt key, two slightly detuned strings and a damped metal overtone. The
// instrument is baked once, so long tails cost one buffer voice on a phone.
const SAMPLE_RATE = 16000;
const D3 = 146.832;
let instrument, airTexture;

function makeInstrument() {
  const samples = new Float32Array(SAMPLE_RATE * 3.2);
  const angular = Math.PI * 2 * D3;
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const strike = 1 - Math.exp(-t * 56);
    const hammer = Math.exp(-t * 11) * Math.sin(angular * 5.035 * t) * 0.13;
    const wood = Math.exp(-t * 2.15) * (Math.sin(angular * 2.004 * t) * 0.33 + Math.sin(angular * 3.012 * t) * 0.12);
    const strings = Math.exp(-t * 1.28) * (Math.sin(angular * t) * 0.41 + Math.sin(angular * 1.0028 * t) * 0.32);
    samples[i] = strike * (hammer + wood + strings) * Math.min(1, (samples.length - i) / 800);
  }
  return samples;
}

function makeAirTexture() {
  const samples = new Float32Array(SAMPLE_RATE * 3);
  let seed = 19077;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    samples[i] = seed / 2147483648 - 1;
  }
  // Join the noise loop at a zero crossing so the cabin never clicks.
  for (let i = 0; i < 64; i++) {
    samples[i] *= i / 64;
    samples[samples.length - 1 - i] *= i / 64;
  }
  return samples;
}

// Each row is a semitone offset from D3 and the time until the next strike.
// The same falling fifth and rising fourth come back in the final landing.
const PHRASES = {
  horizon: [[12, 1.05], [5, 1.58], [10, 3.6], [2, 1.4], [7, 6.9]],
  shadow: [[0, 2.2], [7, 2.85], [3, 4.2], [2, 5.8]],
  signal: [[12, 1.45], [5, 2.05], [10, 5.5], [7, 6.1]],
  passage: [[0, 1.25], [7, 0.8], [10, 1.65], [14, 2.3]],
  windows: [[12, 1.05], [5, 1.58], [10, 1.15], [14, 1.3], [12, 7.0]],
  antenna: [[12, 1.05], [5, 1.58], [10, 1.15], [7, 1.9], [19, 7.9]],
};

export function createHullScore(context, master) {
  instrument ??= makeInstrument();
  airTexture ??= makeAirTexture();
  function buffer(samples) {
    const audio = context.createBuffer(1, samples.length, SAMPLE_RATE);
    audio.getChannelData(0).set(samples);
    return audio;
  }
  function gain(level, out) {
    const node = context.createGain();
    node.gain.value = level;
    node.connect(out);
    return node;
  }
  function pan(amount, out) {
    if (!context.createStereoPanner) return out;
    const node = context.createStereoPanner();
    node.pan.value = amount;
    node.connect(out);
    return node;
  }

  const feltKey = buffer(instrument);
  const dry = gain(1, master);
  const reflections = context.createBiquadFilter();
  reflections.type = 'lowpass';
  reflections.frequency.value = 1850;
  reflections.Q.value = 0.6;
  for (const [delay, position, amount] of [[0.13, -0.6, 0.20], [0.32, 0.55, 0.16]]) {
    const reflection = context.createDelay(0.5);
    reflection.delayTime.value = delay;
    reflection.connect(gain(amount, pan(position, master)));
    reflections.connect(reflection);
  }
  dry.connect(reflections);

  const air = context.createBufferSource();
  air.buffer = buffer(airTexture);
  air.loop = true;
  const chamber = context.createBiquadFilter();
  chamber.type = 'bandpass';
  chamber.frequency.value = 235;
  chamber.Q.value = 0.7;
  air.connect(chamber);
  const airLevel = gain(0, master);
  chamber.connect(airLevel);
  const wake = context.createBiquadFilter();
  wake.type = 'bandpass';
  wake.Q.value = 0.82;
  air.connect(wake);
  const wakeLevel = gain(0, master);
  wake.connect(wakeLevel);
  air.start();

  const voices = new Set();
  let scene, step = 0, next = 0, nextMix = 0;
  function key(semitones, level, position = 0) {
    const voice = context.createBufferSource();
    voice.buffer = feltKey;
    voice.playbackRate.value = 2 ** (semitones / 12);
    const speaker = pan(position, dry);
    const levelNode = gain(level, speaker);
    voice.connect(levelNode);
    voices.add(voice);
    voice.onended = () => {
      voices.delete(voice);
      voice.disconnect();
      levelNode.disconnect();
      if (speaker !== dry) speaker.disconnect();
    };
    voice.start();
  }

  function update(name, load = 0) {
    const now = context.currentTime;
    const pressure = Math.max(0, Math.min(1, Number(load) || 0));
    if (name !== scene) {
      scene = name;
      step = 0;
      next = now + (name === 'signal' ? 2.65 : name === 'passage' ? 0.32 : 0.8);
      nextMix = now;
    }
    if (now >= nextMix) {
      const rate = 1 + Math.sin(now * 0.32) * 0.025;
      air.playbackRate.setTargetAtTime(rate, now, 0.6);
      chamber.frequency.setTargetAtTime(210 + pressure * 540, now, 0.31);
      airLevel.gain.setTargetAtTime((scene === 'receiver' ? 0.021 : 0.043) + pressure * 0.087, now, 0.31);
      nextMix = now + 0.16;
    }
    const phrase = PHRASES[scene];
    if (!phrase || now < next) return;
    const [note, interval] = phrase[step];
    const level = scene === 'signal' ? 0.038 : scene === 'passage' ? 0.075 : 0.089;
    key(note, level, step % 2 === 0 ? -0.22 : 0.19);
    if ((scene === 'windows' || scene === 'antenna') && step === 0) key(0, level * 0.48, 0.12);
    step = (step + 1) % phrase.length;
    next = now + interval;
  }

  // Opening the passage momentarily pressurises the hull. A single noise
  // source also feeds this envelope, independently of radio/music voices.
  function pass(scale = 1) {
    const now = context.currentTime;
    wake.frequency.cancelScheduledValues(now);
    wake.frequency.setValueAtTime(1700, now);
    wake.frequency.exponentialRampToValueAtTime(175, now + 0.86);
    const level = wakeLevel.gain;
    level.cancelScheduledValues(now);
    level.setValueAtTime(Math.max(0.00001, level.value), now);
    level.linearRampToValueAtTime(0.36 * scale, now + 0.13);
    level.exponentialRampToValueAtTime(0.00001, now + 0.94);
  }

  function reset() {
    scene = undefined;
    const now = context.currentTime;
    wakeLevel.gain.cancelScheduledValues(now);
    wakeLevel.gain.setTargetAtTime(0, now, 0.012);
    airLevel.gain.setTargetAtTime(0, now, 0.024);
    for (const voice of voices) { try { voice.stop(now + 0.06); } catch {} }
  }
  function dispose() {
    reset();
    air.stop();
  }
  return {update, pass, reset, dispose};
}
