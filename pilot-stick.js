// Screen-space axes. Pilots can lift their thumb without changing course.
export function createPilotStick(zone, onMove) {
  zone.classList.add('pilot-stick-zone');
  zone.setAttribute('aria-hidden', 'true');
  zone.innerHTML = '<span class="pilot-stick-ring"><i class="pilot-stick-knob"></i></span>';
  const ring = zone.firstElementChild;
  const knob = ring.firstElementChild;
  const listeners = new AbortController();
  const options = {signal:listeners.signal};
  let pointer = null, startX = 0, startY = 0, range = 32;

  function release() {
    if (pointer === null) return;
    const id = pointer;
    pointer = null;
    if (zone.hasPointerCapture(id)) zone.releasePointerCapture(id);
    zone.classList.remove('pilot-stick-held');
    ring.style.removeProperty('left');
    ring.style.removeProperty('top');
    knob.style.removeProperty('transform');
    onMove(0, 0);
  }

  zone.addEventListener('pointerdown', event => {
    if (pointer !== null || event.button !== 0) return;
    event.preventDefault();
    startX = event.clientX;
    startY = event.clientY;
    pointer = event.pointerId;
    range = Math.max(24, ring.offsetWidth * .42);
    const bounds = zone.getBoundingClientRect();
    ring.style.left = (startX - bounds.left) + 'px';
    ring.style.top = (startY - bounds.top) + 'px';
    zone.classList.add('pilot-stick-held');
    zone.setPointerCapture(pointer);
  }, options);
  zone.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    const dx = (event.clientX - startX) / range;
    const dy = (event.clientY - startY) / range;
    const distance = Math.hypot(dx, dy);
    const bounded = Math.min(1, distance);
    const ux = distance ? dx / distance : 0;
    const uy = distance ? dy / distance : 0;
    knob.style.transform = 'translate(' + (ux * bounded * range) + 'px,' + (uy * bounded * range) + 'px)';
    // Small displacements give fine corrections, with a quiet centre for finger jitter.
    const power = Math.pow(Math.max(0, (bounded - .08) / .92), 1.32);
    onMove(ux * power, uy * power);
  }, options);
  for (const event of ['pointerup','pointercancel','lostpointercapture']) {
    zone.addEventListener(event, e => { if (e.pointerId === pointer) release(); }, options);
  }
  window.addEventListener('blur', release, options);
  window.addEventListener('resize', release, options);
  document.addEventListener('visibilitychange', release, options);
  document.addEventListener('freeze', release, options);
  window.addEventListener('pagehide', release, options);
  return {release, destroy() {release();listeners.abort();}};
}
