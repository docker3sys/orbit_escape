import { createHullScore } from "./hull-score.js";

// Oscillator phrases keep the receiver usable offline and on small speakers.
// Each station's pulse count matches its recorder key, even in mono.
const CALLS = {
  "note-a": { hz: 293.665, starts: [0], duration: 0.27, wave: "triangle" },
  "note-b": { hz: 440, starts: [0, 0.22], duration: 0.14, wave: "sine" },
  "note-c": { hz: 587.330, starts: [0, 0.17, 0.34], duration: 0.12, wave: "sine" },
};

export function createLastAudio() {
  let context, master, bed, suspendTimer, score;
  let paused = true, muted = false, disposed = false;
  let phase, choice = "relay", nextMix = 0;
  const lines = [];
  const voices = new Set();

  function gain(output, level) {
    const node = context.createGain();
    node.gain.value = level;
    node.connect(output);
    return node;
  }

  function startGraph() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return false;
    context = new Audio();
    master = gain(context.destination, 0);
    score = createHullScore(context, master);
    bed = gain(master, 0.83);
    const pitches = [73.416, 146.832, 220];
    for (const hz of pitches) {
      const osc = context.createOscillator();
      const level = gain(bed, 0);
      osc.type = hz === pitches[0] ? "triangle" : "sine";
      osc.frequency.value = hz;
      osc.connect(level);
      osc.start();
      lines.push({osc, level});
    }
    return true;
  }

  function unlock() {
    if (disposed) return;
    paused = false;
    clearTimeout(suspendTimer);
    if (muted) return;
    try {
      if (!context && !startGraph()) return;
      if (context.state !== "running") context.resume().catch(() => {});
      master.gain.setTargetAtTime(0.74, context.currentTime, 0.022);
    } catch { /* The on-screen receiver duplicates every call. */ }
  }

  function canPlay() {
    return !!master && !disposed && !paused && !muted && context.state === "running";
  }

  function fadeVoice(voice) {
    const now = context.currentTime;
    const volume = voice.envelope.gain;
    if (volume.cancelAndHoldAtTime) volume.cancelAndHoldAtTime(now);
    else {
      volume.cancelScheduledValues(now);
      volume.setValueAtTime(volume.value, now);
    }
    volume.setTargetAtTime(0, now, 0.004);
    try { voice.osc.stop(now + 0.025); } catch {}
    voice.stopped = true;
  }

  function hush() {
    clearTimeout(suspendTimer);
    phase = undefined;
    score?.reset();
    if (!context || disposed) return;
    const now = context.currentTime;
    master.gain.setTargetAtTime(0, now, 0.012);
    for (const voice of voices) if (!voice.stopped) fadeVoice(voice);
    const instance = context;
    suspendTimer = setTimeout(() => {
      if ((paused || muted) && !disposed && instance.state === "running") {
        instance.suspend().catch(() => {});
      }
    }, 85);
  }

  function mute(value) {
    muted = !!value;
    if (muted) hush();
    else if (!paused) unlock();
  }
  function suspend() { paused = true; hush(); }

  function tone(hz, duration, level, after = 0, wave = "sine", receiver = false) {
    if (!canPlay() || !hz || voices.size >= 48) return;
    const start = context.currentTime + after;
    const osc = context.createOscillator();
    const envelope = gain(master, 0);
    const volume = envelope.gain;
    osc.type = wave;
    osc.frequency.value = hz;
    volume.setValueAtTime(0, start);
    volume.linearRampToValueAtTime(level, start + Math.min(receiver ? 0.013 : 0.07, duration * 0.15));
    volume.exponentialRampToValueAtTime(level * 0.61, start + duration * 0.68);
    volume.exponentialRampToValueAtTime(0.00001, start + duration);
    osc.connect(envelope);
    const voice = {osc, envelope, receiver, stopped:false};
    voices.add(voice);
    osc.onended = () => {
      voices.delete(voice);
      osc.disconnect();
      envelope.disconnect();
    };
    osc.start(start);
    osc.stop(start + duration + 0.008);
  }

  function cue(name) {
    if (!canPlay()) return;
    const call = CALLS[name];
    if (call) {
      for (const voice of voices) if (voice.receiver && !voice.stopped) fadeVoice(voice);
      for (const when of call.starts) {
        tone(call.hz, call.duration, 0.178, when, call.wave, true);
        tone(call.hz * 2, call.duration * 0.78, 0.022, when, "sine", true);
      }
      return;
    }
    if (name === "found") {
      [220, 293.665, 369.994, 440].forEach((hz, i) => tone(hz, 0.72, 0.082, i * 0.09));
    } else if (name === "pass") {
      score.pass(0.82);
      tone(329.628, 0.22, 0.09);
      tone(493.883, 0.51, 0.098, 0.10);
    } else if (name === "miss") {
      tone(174.614, 0.30, 0.075, 0, "triangle");
      tone(146.832, 0.48, 0.057, 0.15);
    } else if (name === "home") {
      score.pass(0.62);
      [146.832, 220, 293.665, choice === "people" ? 349.228 : 440].forEach((hz, i) =>
        tone(hz, 1.55, 0.069, i * 0.14, i === 3 ? "triangle" : "sine"));
    }
  }

  function mix(state, telemetry, now) {
    const flying = state.phase === "fly";
    const home = state.phase === "home";
    const progress = Math.min(1, Math.max(0, Number(telemetry?.progress) || 0));
    const scene = flying ? "passage" : home ? (state.choice === "people" ? "windows" : "antenna") : "receiver";
    score.update(scene, flying ? 0.12 + 0.83 * progress : home ? 0.07 : 0);
    const params = [
      [73.416, flying ? 0.068 : 0.040],
      [home ? 220 : 146.832, flying ? 0.040 : 0.022],
      [flying ? 220 + 1.35 * progress : home ? 293.665 : 220, flying ? 0.019 + 0.020 * progress : 0.009],
    ];
    lines.forEach(({osc,level}, i) => {
      osc.frequency.setTargetAtTime(params[i][0], now, 0.24);
      level.gain.setTargetAtTime(params[i][1], now, 0.27);
    });
  }

  function update(dt, state, telemetry) {
    if (!canPlay() || !state) return;
    const now = context.currentTime;
    choice = state.choice;
    if (phase !== state.phase) {
      phase = state.phase;
      nextMix = now;
    }
    if (now >= nextMix) {
      mix(state, telemetry, now);
      nextMix = now + 0.11;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(suspendTimer);
    if (!context) return;
    score.dispose();
    const end = context.currentTime + 0.035;
    master.gain.setTargetAtTime(0, context.currentTime, 0.006);
    for (const voice of voices) if (!voice.stopped) fadeVoice(voice);
    for (const {osc} of lines) { try { osc.stop(end); } catch {} }
    const instance = context;
    setTimeout(() => {
      if (instance.state !== "closed" && instance.close) instance.close().catch(() => {});
    }, 55);
  }

  return {unlock, mute, suspend, update, cue, dispose};
}
