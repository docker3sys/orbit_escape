// Limits apply to the scene only. The DOM controls and text stay at native resolution.
const qualityKey = 'orbit-escape/graphics/1';
const tiers = [
  {name:'low', dpr:.95, pixels:620000, edge:1536},
  {name:'balanced', dpr:1.5, pixels:1150000, edge:2048},
  {name:'high', dpr:2, pixels:2100000, edge:2560},
];
const modes = ['auto','low','high'];
let preference = 'auto';
try {
  const saved = globalThis.localStorage?.getItem(qualityKey);
  if (modes.includes(saved)) preference = saved;
} catch { /* The session preference still works if storage is unavailable. */ }

export function getQualityPreference() { return preference; }
export function setQualityPreference(value) {
  if (!modes.includes(value)) return;
  preference = value;
  try { globalThis.localStorage?.setItem(qualityKey, value); } catch {}
}

export function createRenderBudget() {
  const memory = globalThis.navigator?.deviceMemory;
  const cores = globalThis.navigator?.hardwareConcurrency;
  const smallDevice = (memory > 0 && memory <= 3) || (cores > 0 && cores <= 4);
  let automatic = smallDevice ? 0 : 1;
  const ceiling = smallDevice ? 1 : 2;
  let mode = preference;
  let last = null, elapsed = 0, frames = 0, slow = 0, fast = 0;
  function resetTiming() {
    last = null;
    elapsed = frames = slow = fast = 0;
  }
  function tier() {
    return tiers[preference === 'auto' ? automatic : preference === 'low' ? 0 : 2];
  }
  function frame(now = performance.now()) {
    const changed = mode !== preference;
    if (changed) { mode = preference; resetTiming(); }
    if (preference !== 'auto') return changed;
    const delta = last === null ? 0 : now - last;
    last = now;
    // Resuming a backgrounded WebView or one long loading pause is not a slow GPU.
    if (delta <= 0 || delta > 600) {
      elapsed = frames = slow = fast = 0;
      return changed;
    }
    elapsed += delta;
    frames++;
    if (elapsed < 1400) return changed;
    const mean = elapsed / frames;
    elapsed = frames = 0;
    slow = mean > 28 ? slow + 1 : 0;
    fast = mean < 19.5 ? fast + 1 : 0;
    // React to sustained pressure quickly. Give the GPU a longer rest before upgrading.
    const next = slow >= 2 ? Math.max(0, automatic - 1) :
      fast >= 9 ? Math.min(ceiling, automatic + 1) : automatic;
    if (next === automatic) return changed;
    automatic = next;
    resetTiming();
    return true;
  }
  function pixelRatio(width, height) {
    const limits = tier();
    const w = Math.max(1,width), h = Math.max(1,height);
    const deviceRatio = globalThis.devicePixelRatio || 1;
    return Math.min(deviceRatio, limits.dpr, Math.sqrt(limits.pixels / (w * h)),
      limits.edge / Math.max(w,h));
  }
  return {frame, pixelRatio, resetTiming, profile:() => tier().name};
}
