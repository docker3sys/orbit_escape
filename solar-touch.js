// Keep the thumb that pilots and the thumb that looks around independent.
export function createSolarTouch(stick, sky, { onLook, onUse, onSky, signal }) {
  const listeners = {signal};
  const state = { x: 0, y: 0, lift: 0, assisted: false };
  const liftToggle = document.getElementById('solarLiftToggle');
  const liftPad = document.getElementById('solarLiftPad');
  const liftKey = 'orbit-escape/vertical-thrust/1';
  const liftButtons = Array.from(liftPad.querySelectorAll('[data-lift]'));
  const heldLift = new Map();
  let liftEnabled = false;
  let assistTimer = 0;
  try { liftEnabled = localStorage.getItem(liftKey) === '1'; } catch {}

  function syncLift() {
    let sum = 0;
    for (const button of heldLift.values()) sum += Number(button.dataset.lift);
    state.lift = Math.min(1, Math.max(-1, sum));
    for (const button of liftButtons) {
      button.classList.toggle('is-firing', Array.from(heldLift.values()).includes(button));
    }
  }

  function releaseLift() {
    for (const [id, button] of heldLift) {
      if (typeof id === 'number' && button.hasPointerCapture(id)) button.releasePointerCapture(id);
    }
    heldLift.clear();
    clearTimeout(assistTimer);
    syncLift();
  }

  function setLiftControls() {
    liftToggle.setAttribute('aria-pressed', String(liftEnabled));
    liftToggle.classList.toggle('chip--active', liftEnabled);
    liftPad.hidden = !liftEnabled;
    if (!liftEnabled) releaseLift();
  }
  setLiftControls();
  liftToggle.addEventListener('click', () => {
    liftEnabled = !liftEnabled;
    setLiftControls();
    try { localStorage.setItem(liftKey, liftEnabled ? '1' : '0'); } catch {}
  }, listeners);

  function engageLift(id, button) {
    if (!liftEnabled) return;
    heldLift.set(id, button);
    state.assisted = true;
    syncLift();
    onUse();
  }
  for (const button of liftButtons) {
    button.addEventListener('pointerdown', event => {
      if (!liftEnabled || event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      engageLift(event.pointerId, button);
    }, listeners);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, event => {
        if (heldLift.delete(event.pointerId)) syncLift();
      }, listeners);
    }
    for (const type of ['keydown', 'keyup']) {
      button.addEventListener(type, event => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
        if (type === 'keydown' && !event.repeat) engageLift('key', button);
        if (type === 'keyup' && heldLift.delete('key')) syncLift();
      }, listeners);
    }
    button.addEventListener('blur', () => {
      if (heldLift.delete('key')) syncLift();
    }, listeners);
    // Accessibility services can activate a button without pointer or key events.
    button.addEventListener('click', event => {
      if (event.detail !== 0 || !liftEnabled) return;
      clearTimeout(assistTimer);
      engageLift('activate', button);
      assistTimer = setTimeout(() => { heldLift.delete('activate'); syncLift(); }, 160);
    }, listeners);
  }
  let stickId = null;
  let lookId = null;
  let lastX = 0;
  let lastY = 0;
  let stickCenterX = 0;
  let stickCenterY = 0;
  let stickRadius = 1;

  function updateStick(event) {
    const dx = event.clientX - stickCenterX;
    const dy = event.clientY - stickCenterY;
    const length = Math.hypot(dx, dy);
    const travel = Math.min(1, length / stickRadius);
    const value = Math.max(0, (travel - 0.09) / 0.91);
    const ux = dx / (length || 1);
    const uy = dy / (length || 1);
    state.x = ux * value;
    state.y = -uy * value;
    stick.style.setProperty('--sx', (ux * travel * stickRadius) + 'px');
    stick.style.setProperty('--sy', (uy * travel * stickRadius) + 'px');
  }

  function resetStick() {
    stickId = null;
    state.x = 0;
    state.y = 0;
    stick.classList.remove('is-engaged');
    stick.style.removeProperty('--sx');
    stick.style.removeProperty('--sy');
  }

  function endStick(event) {
    if (event.pointerId === stickId) resetStick();
  }

  stick.addEventListener('pointerdown', event => {
    if (stickId !== null || event.button !== 0) return;
    event.preventDefault();
    const bounds = stick.getBoundingClientRect();
    stickCenterX = bounds.left + bounds.width / 2;
    stickCenterY = bounds.top + bounds.height / 2;
    stickRadius = bounds.width * 0.29;
    stickId = event.pointerId;
    state.assisted = true;
    stick.setPointerCapture(stickId);
    stick.classList.add('is-engaged');
    onUse();
    updateStick(event);
  }, listeners);
  stick.addEventListener('pointermove', event => {
    if (event.pointerId === stickId) updateStick(event);
  }, listeners);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stick.addEventListener(type, endStick, listeners);
  }

  sky.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || lookId !== null) return;
    lookId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    sky.setPointerCapture(lookId);
    onSky();
  }, listeners);
  sky.addEventListener('pointermove', event => {
    if (event.pointerId !== lookId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (dx || dy) {
      onUse();
      onLook(dx, dy);
    }
  }, listeners);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    sky.addEventListener(type, event => {
      if (event.pointerId === lookId) lookId = null;
    }, listeners);
  }

  return {
    state,
    reset() {
      if (stickId !== null && stick.hasPointerCapture(stickId)) stick.releasePointerCapture(stickId);
      if (lookId !== null && sky.hasPointerCapture(lookId)) sky.releasePointerCapture(lookId);
      resetStick();
      releaseLift();
      lookId = null;
    }
  };
}
