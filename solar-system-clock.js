import { getSolarEphemeris, refreshSolarEphemeris } from "./solar-ephemeris.js";
import { planetSpecs } from "./solar-catalog.js";

const AU_KM = 149597870.7;
const radii = Object.fromEntries(planetSpecs.map(body => [body.key,body.trueRadiusKm]));
radii.moon = 1737.4;

// Right-handed ecliptic J2000. The game looks along -Z and uses +Y as north.
export function worldCoordinates([x,y,z]) {
  return [x*AU_KM,z*AU_KM,-y*AU_KM];
}

export function orbitalDrift(previous, next, eye) {
  let closestKey, smallestRange = Infinity;
  if (previous && eye) {
    const [x,y,z] = eye;
    for (const key of Object.keys(radii)) {
      const point = previous[key];
      if (!point || !next[key]) continue;
      const relativeRange = Math.hypot(x-point[0],y-point[1],z-point[2]) / radii[key];
      if (relativeRange < 48 && relativeRange < smallestRange) {
        smallestRange = relativeRange;
        closestKey = key;
      }
    }
  }
  if (!closestKey) return [0,0,0];
  return next[closestKey].map((value,i) => value-previous[closestKey][i]);
}

export function createOrbitalClock() {
  let lastTime = null, lastPositions = null, lastLabel = "";
  return {
    refresh() {
      return refreshSolarEphemeris().then(() => { lastTime = null; }, () => {});
    },
    update(timeMs,eye) {
      if (lastTime !== null && timeMs >= lastTime && timeMs-lastTime < 250) return null;
      const ephemeris = getSolarEphemeris(timeMs);
      const positions = {};
      for (const key of Object.keys(ephemeris.positionsAU)) positions[key] = worldCoordinates(ephemeris.positionsAU[key]);
      const drift = orbitalDrift(lastPositions,positions,eye);
      lastTime = timeMs;
      lastPositions = positions;
      const label = ephemeris.label + " · " + new Date(ephemeris.epochMs).toISOString().slice(0,16).replace("T"," ") + " UTC";
      if (lastLabel !== label && typeof document !== "undefined") {
        const readout = document.getElementById("solarEpoch");
        if (readout) readout.textContent = label;
        lastLabel = label;
      }
      return {positions,drift,ephemeris};
    }
  };
}

// Two short, symmetric samples give an instantaneous osculating ellipse for the optional orbit overlay.
// Use the same epoch as the bodies so the guide passes through their displayed positions.
export function orbitPaths(timeMs, segments=112) {
  const halfStep = 180000;
  const before = getSolarEphemeris(timeMs-halfStep).positionsAU;
  const current = getSolarEphemeris(timeMs).positionsAU;
  const after = getSolarEphemeris(timeMs+halfStep).positionsAU;
  const mu = 0.0002959122082855911; // solar GM in AU³/day²
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = a => { const length = Math.hypot(...a); return a.map(v => v/length); };
  const paths = {};
  for (const body of planetSpecs) {
    const key=body.key, r=current[key];
    const v=after[key].map((x,i)=>(x-before[key][i])*(86400000/(2*halfStep)));
    const h=cross(r,v), radial=unit(r);
    const e=cross(v,h).map((value,i)=>value/mu-radial[i]);
    const eccentricity=Math.hypot(...e);
    if (!(eccentricity < 1) || !(Math.hypot(...h) > 0)) continue;
    const periapsis=eccentricity > 1e-6 ? unit(e) : radial;
    const transverse=cross(unit(h),periapsis);
    const p=(h[0]*h[0]+h[1]*h[1]+h[2]*h[2])/mu;
    paths[key]=Array.from({length:segments},(_,i)=>{
      const angle=2*Math.PI*i/segments, cs=Math.cos(angle), sn=Math.sin(angle);
      const distance=p/(1+eccentricity*cs);
      return worldCoordinates(periapsis.map((x,k)=>distance*(x*cs+transverse[k]*sn)));
    });
  }
  return paths;
}
