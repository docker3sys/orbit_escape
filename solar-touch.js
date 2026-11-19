// Keep the thumb that pilots and the thumb that looks around independent.
export function createSolarTouch(stick, sky, { onLook, onUse, onSky }) {
  const state = { x: 0, y: 0, assisted: false };
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
  });
  stick.addEventListener('pointermove', event => {
    if (event.pointerId === stickId) updateStick(event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stick.addEventListener(type, endStick);
  }

  sky.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || lookId !== null) return;
    lookId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    sky.setPointerCapture(lookId);
    onSky();
  });
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
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    sky.addEventListener(type, event => {
      if (event.pointerId === lookId) lookId = null;
    });
  }

  return {
    state,
    reset() {
      if (stickId !== null && stick.hasPointerCapture(stickId)) stick.releasePointerCapture(stickId);
      if (lookId !== null && sky.hasPointerCapture(lookId)) sky.releasePointerCapture(lookId);
      resetStick();
      lookId = null;
    }
  };
}
