import { createHullScore } from "./hull-score.js";

// The receiver and the score share the navigation clock, including after a missed pass.
const CYCLE_SECONDS = 3.6;
const CALL_NOTES = [293.665, 220, 329.628];
const PEOPLE_REPLY = [146.832, 195.998, 246.942];
const AUDIO_ACTIVE = new Set(["scan", "gate", "return", "complete"]);

export function createAudio() {
  let context = null;
  let bus, echo, droneFilter, droneLevel, score;
  let previousPhase = null;
  let inPassage = false;
  let mixClock = 0;
  let elapsed = 0;
  let muted = false;
  let paused = true;
  let disposed = false;
  let suspendTimer;
  const held = [];
  const voices = new Set();

  function gainNode(value, output) {
    const node = context.createGain();
    node.gain.value = value;
    node.connect(output);
    return node;
  }

  function initialize() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio || disposed) return false;
    context = new Audio();
    bus = gainNode(0, context.destination);
    score = createHullScore(context, bus);

    // A filtered echo adds space to the receiver while keeping the initial pulse distinct.
    const wet = gainNode(0.17, bus);
    const delay = context.createDelay(1);
    delay.delayTime.value = 0.27;
    const damp = context.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 1250;
    damp.Q.value = 0.45;
    delay.connect(damp);
    damp.connect(wet);
    const feedback = gainNode(0.16, delay);
    damp.connect(feedback);
    echo = gainNode(0.5, delay);

    droneLevel = gainNode(0.15, bus);
    droneFilter = context.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 280;
    droneFilter.Q.value = 0.5;
    droneFilter.connect(droneLevel);
    // Low hull resonance and two audible partials for small phone speakers.
    for (const [hz, waveform, level, detune] of [
      [73.416, "triangle", 0.45, -3], [146.832, "sine", 0.26, 2],
      [220, "triangle", 0.11, 3],
    ]) {
      const osc = context.createOscillator();
      osc.type = waveform;
      osc.frequency.value = hz;
      osc.detune.value = detune;
      osc.connect(gainNode(level, droneFilter));
      osc.start();
      held.push(osc);
    }
    return true;
  }

  function fadeBus(value) {
    if (!context || !bus) return;
    const now = context.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setTargetAtTime(value, now, 0.025);
  }

  function unlock() {
    if (disposed) return;
    paused = false;
    clearTimeout(suspendTimer);
    if (muted) return;
    try {
      if (!context && !initialize()) return;
      if (context.state !== "running") context.resume().catch(() => {});
      fadeBus(0.70);
    } catch {
      // The visual receiver stays playable if audio is unavailable.
    }
  }

  function hush() {
    previousPhase = null;
    inPassage = false;
    score?.reset();
    fadeBus(0);
    clearTimeout(suspendTimer);
    const instance = context;
    if (!instance || instance.state !== "running") return;
    suspendTimer = setTimeout(() => {
      if (instance === context && (muted || paused) && !disposed) {
        // Prevent the rest of an old ping from playing on resume.
        for (const oscillator of voices) {
          try { oscillator.stop(); } catch {}
        }
        instance.suspend().catch(() => {});
      }
    }, 120);
  }

  function mute(flag) {
    muted = Boolean(flag);
    if (muted) hush();
    else if (!paused) unlock();
  }

  function suspend() {
    paused = true;
    hush();
  }

  function canPlay() {
    return !disposed && !paused && !muted && context?.state === "running";
  }

  function tone(hz, duration, level, delay = 0, options = {}) {
    if (!canPlay() || voices.size >= 18 || level < 0.001) return;
    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    const envelope = context.createGain();
    const attack = options.attack ?? 0.019;
    osc.type = options.shape ?? "sine";
    osc.frequency.setValueAtTime(hz, start);
    if (options.endHz) osc.frequency.exponentialRampToValueAtTime(options.endHz, start + duration);
    envelope.gain.setValueAtTime(0.00001, start);
    envelope.gain.exponentialRampToValueAtTime(level, start + Math.min(attack, duration / 3));
    const releaseStart = start + duration * (options.sustain ?? 0.32);
    envelope.gain.setValueAtTime(level, Math.max(start + attack, releaseStart));
    envelope.gain.exponentialRampToValueAtTime(0.00001, start + duration);
    osc.connect(envelope);
    envelope.connect(bus);
    envelope.connect(echo);
    voices.add(osc);
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
      voices.delete(osc);
    };
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  function call(index, strength, state, extendedRelay) {
    const long = index === 2;
    const duration = long ? (extendedRelay ? 0.51 : 0.35) * CYCLE_SECONDS : 0.23;
    const level = 0.025 + 0.085 * strength;
    tone(CALL_NOTES[index], duration, level, 0, { sustain: long ? 0.84 : 0.56 });
    tone(CALL_NOTES[index] * 2, duration * 0.75, level * 0.18, 0.007);
    if (state.choice === "people" && (state.stage === "return" || state.stage === "complete")) {
      tone(PEOPLE_REPLY[index], long ? 0.81 : 0.24, 0.036, long ? 0.85 : 0.31, {
        shape: "triangle", attack: 0.06, sustain: 0.5,
      });
    }
  }

  function update(dt, state, telemetry) {
    if (!canPlay() || !state || !telemetry) return;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    elapsed += Math.min(step, 0.12);
    if (telemetry.warping && !inPassage) score.pass(0.92);
    inPassage = Boolean(telemetry.warping);
    mixClock -= step;
    if (mixClock <= 0) {
      mixClock = 0.16;
      const nearDisk = ["approach", "choice", "deliver"].includes(state.stage);
      let scene = nearDisk ? "shadow" : "horizon";
      if (state.stage === "return" || state.stage === "complete") scene = state.choice === "people" ? "windows" : "antenna";
      if (telemetry.warping) scene = "transit";
      const load = (nearDisk ? 0.25 : 0.06) + (telemetry.driving ? 0.69 : 0);
      score.update(scene, telemetry.warping ? 1 : load);
      const edge = nearDisk ? 405 : 255;
      const warp = telemetry.warping ? 110 : 0;
      const breathing = Math.sin(elapsed * 0.42) * 25 + Math.sin(elapsed * 0.17) * 12;
      droneFilter.frequency.setTargetAtTime(edge + breathing + warp, context.currentTime, 0.35);
      droneLevel.gain.setTargetAtTime(nearDisk ? 0.21 : 0.14, context.currentTime, 0.5);
    }

    const phase = telemetry.phase;
    if (!AUDIO_ACTIVE.has(state.stage) || telemetry.warping || !Number.isFinite(phase)) {
      previousPhase = null;
      return;
    }
    const current = ((phase % 1) + 1) % 1;
    const previous = previousPhase;
    previousPhase = current;
    if (previous === null || step > 0.3) return;
    const phaseStep = (current - previous + 1) % 1;
    if (phaseStep <= 0 || phaseStep > 0.16) return;
    const extended = state.choice === "relay" && (state.stage === "return" || state.stage === "complete");
    const starts = [0, 0.20, extended ? 0.42 : 0.48];
    const strength = Math.max(0, Math.min(1, Number(telemetry.strength) || 0));
    for (let i = 0; i < starts.length; i++) {
      const distance = (starts[i] - previous + 1) % 1;
      if (distance > 0 && distance <= phaseStep + 1e-9) call(i, strength, state, extended);
    }
  }

  function cue(name) {
    if (!canPlay()) return;
    switch (name) {
      case "lock":
        tone(220, 0.22, 0.07);
        tone(329.628, 0.55, 0.07, 0.15);
        break;
      case "warp":
        tone(110, 1.35, 0.105, 0, { shape: "triangle", endHz: 49, attack: 0.23 });
        tone(164.814, 1.25, 0.063, 0.12, { endHz: 493.883, attack: 0.33 });
        break;
      case "rescue":
        tone(174.614, 0.32, 0.095);
        tone(146.832, 0.52, 0.07, 0.29);
        break;
      case "dock":
        tone(146.832, 0.7, 0.1, 0, { shape: "triangle", attack: 0.06 });
        tone(220, 0.75, 0.06, 0.17);
        break;
      case "people":
        PEOPLE_REPLY.forEach((hz, i) => tone(hz, 0.58, 0.08, i * 0.19, { shape: "triangle" }));
        break;
      case "relay":
        [220, 329.628, 440].forEach((hz, i) => tone(hz, 0.56, 0.075, i * 0.16));
        break;
      case "complete":
        [146.832, 220, 293.665, 369.994].forEach((hz, i) =>
          tone(hz, 1.45, 0.066, i * 0.21, { attack: 0.1, sustain: 0.55 }));
        break;
    }
  }

  function dispose() {
    disposed = true;
    clearTimeout(suspendTimer);
    score?.dispose();
    for (const osc of held) osc.stop();
    for (const osc of voices) {
      try { osc.stop(); } catch {}
    }
    if (context && context.state !== "closed") context.close().catch(() => {});
    context = null;
  }

  return { unlock, update, cue, mute, suspend, dispose };
}
