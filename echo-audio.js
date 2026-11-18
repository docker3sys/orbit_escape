// Both transmitters keep sending while the station is between the ship and a mast.
// Their gains follow the receiver continuously, including halfway through a note.
const A_NOTES = [
  [0.00, 220.00, 0.32], [0.23, 293.66, 0.24], [0.48, 329.63, 0.98],
];
const B_NOTES = [
  [0.00, 440.00, 0.56], [0.17, 392.00, 0.22], [0.47, 293.66, 0.31], [0.72, 246.94, 0.44],
];
const SHUTTLE_NOTES = [
  [0.00, 146.83, 1.50], [0.32, 220.00, 0.48], [0.61, 261.63, 0.39], [0.78, 293.66, 0.62],
];
const clampLevel = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export function createEchoAudio() {
  let context, master, left, right, cabin;
  let muted = false;
  let paused = true;
  let disposed = false;
  let suspendTimer;
  let previous = null;
  let lastPhase;
  let mixCooldown = 0;
  const voices = new Set();

  function gain(output, value) {
    const node = context.createGain();
    node.gain.value = value;
    node.connect(output);
    return node;
  }

  function receiver(pan) {
    if (!context.createStereoPanner) return gain(master, 0);
    const speaker = context.createStereoPanner();
    speaker.pan.value = pan;
    speaker.connect(master);
    return gain(speaker, 0);
  }

  function unlock() {
    if (disposed) return;
    paused = false;
    clearTimeout(suspendTimer);
    if (muted) return;
    try {
      if (!context) {
        const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Audio) return;
        context = new Audio();
        master = gain(context.destination, 0);
        left = receiver(-0.36);
        right = receiver(0.36);
        cabin = gain(master, 0.75);
      }
      if (context.state !== 'running') context.resume().catch(() => {});
      master.gain.setTargetAtTime(0.70, context.currentTime, 0.028);
    } catch {
      // Visual signal levels and all navigation remain available.
    }
  }

  function silence() {
    previous = null;
    clearTimeout(suspendTimer);
    if (!master || disposed) return;
    master.gain.setTargetAtTime(0, context.currentTime, 0.014);
    const instance = context;
    suspendTimer = setTimeout(() => {
      if (disposed || (!paused && !muted) || instance !== context) return;
      for (const oscillator of voices) {
        try { oscillator.stop(); } catch {}
      }
      if (instance.state === 'running') instance.suspend().catch(() => {});
    }, 90);
  }

  function mute(value) {
    muted = Boolean(value);
    if (muted) silence();
    else if (!paused) unlock();
  }

  function suspend() {
    paused = true;
    silence();
  }

  function ready() {
    return !disposed && !paused && !muted && context?.state === 'running' && master;
  }

  function tone(output, hz, duration, gainValue, wave = 'sine', after = 0) {
    if (!ready() || voices.size >= 28) return;
    const now = context.currentTime + after;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = hz;
    const volume = envelope.gain;
    volume.setValueAtTime(0.00001, now);
    volume.exponentialRampToValueAtTime(gainValue, now + Math.min(0.045, duration * 0.16));
    volume.exponentialRampToValueAtTime(gainValue * 0.7, now + duration * 0.58);
    volume.exponentialRampToValueAtTime(0.00001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      voices.delete(oscillator);
    };
    voices.add(oscillator);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function crossedNotes(sequence, phase, step, play) {
    for (const [beat, hz, duration] of sequence) {
      const distance = (beat - phase + 1) % 1;
      if (distance > 1e-8 && distance <= step + 1e-8) play(hz, duration);
    }
  }

  function update(dt, state, telemetry) {
    if (!ready() || !state || !telemetry) return;
    const stageChanged = state.phase !== lastPhase;
    lastPhase = state.phase;
    mixCooldown -= Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (mixCooldown <= 0 || stageChanged) {
      mixCooldown = 0.055;
      const now = context.currentTime;
      left.gain.setTargetAtTime(clampLevel(telemetry.a) ** 1.35, now, 0.08);
      right.gain.setTargetAtTime(clampLevel(telemetry.b) ** 1.35, now, 0.08);
    }

    if (!Number.isFinite(telemetry.signalPhase)) { previous = null; return; }
    const phase = ((telemetry.signalPhase % 1) + 1) % 1;
    const from = previous;
    previous = phase;
    if (from === null || dt > 0.25) return;
    // Ignore clock resets (new game, visibility change), but handle a normal loop boundary.
    const step = (phase - from + 1) % 1;
    if (step <= 0 || step > 0.14) return;

    const warm = state.choice === 'people';
    crossedNotes(A_NOTES, from, step, (hz, duration) => {
      tone(left, hz, duration, 0.135, 'triangle');
      tone(left, hz * 2, duration * 0.56, warm ? 0.019 : 0.009);
    });
    crossedNotes(B_NOTES, from, step, (hz, duration) => {
      tone(right, hz, duration, 0.09);
      tone(right, hz * 1.5, duration * 0.73, warm ? 0.011 : 0.024);
    });
    if (state.phase === 'gate' || state.phase === 'arrived') {
      crossedNotes(SHUTTLE_NOTES, from, step, (hz, duration) => {
        tone(cabin, hz, duration, state.phase === 'arrived' ? 0.08 : 0.035, 'triangle');
        if (state.phase === 'arrived') tone(cabin, hz * (warm ? 1.5 : 2), duration * 0.8, 0.025, 'sine', 0.11);
      });
    }
  }

  function cue(name) {
    if (!ready()) return;
    if (name === 'sample-a' || name === 'sample-b') {
      const low = name === 'sample-a';
      tone(cabin, low ? 220 : 440, 0.22, 0.08, low ? 'triangle' : 'sine');
      tone(cabin, low ? 329.63 : 293.66, 0.52, 0.085, 'sine', 0.17);
    } else if (name === 'gate' || name === 'arrived') {
      const arrival = name === 'arrived';
      const chord = arrival ? [146.83, 220, 293.66, 392] : [220, 293.66, 329.63];
      chord.forEach((hz, index) => tone(cabin, hz, arrival ? 1.5 : 0.76, 0.064, 'sine', index * 0.15));
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(suspendTimer);
    for (const oscillator of voices) {
      try { oscillator.stop(); } catch {}
    }
    if (context && context.state !== 'closed') context.close().catch(() => {});
  }

  return {unlock, mute, suspend, update, cue, dispose};
}
