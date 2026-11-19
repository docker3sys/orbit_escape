// The solar navigator uses kilometres; Three's camera and ephemerides keep CPU doubles.
export const SHIP_LENGTH_KM = .007;
export const SHIP_WIDTH_KM = .003;
export const HULL_CLEARANCE_KM = Math.hypot(SHIP_LENGTH_KM, SHIP_WIDTH_KM) / 2;

export function approachSpeedLimit(clearanceKm) {
  return Math.min(149896.229, Math.max(.0012, Math.max(0, clearanceKm) * .74));
}

export function lodFromDistance(radiusKm, distanceKm) {
  if (distanceKm < radiusKm * 1.22) return 'near';
  return distanceKm < radiusKm * 16 ? 'mid' : 'far';
}

// An altitude above the mean radius, or the reference cloud deck on a giant.
export function arrivalRangeKm(radiusKm, mode, key) {
  if (mode === 'orbit' || !(radiusKm > 0)) return null;
  if (!['sun','mercury','venus','earth','moon','mars','jupiter','saturn','uranus','neptune'].includes(key)) return null;
  if (mode === 'surface') return radiusKm + .050;
  if (mode === 'local') return radiusKm + Math.max(10, radiusKm * .035);
  return null;
}

export function angularDiameter(radiusKm, distanceKm) {
  return 2 * Math.asin(Math.min(1, radiusKm / distanceKm));
}

export function greenwichSiderealAngle(timeMs) {
  const days = timeMs / 86400000 - 10957.5;
  const centuries = days / 36525;
  const degrees = 280.46061837 + 360.98564736629 * days + .000387933 * centuries * centuries;
  return (degrees % 360) * Math.PI / 180;
}
