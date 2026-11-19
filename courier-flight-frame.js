// orbit-escape.flight.v2 is shared with the original courier simulation. Keep its
// historical epoch and axes on disk, and translate only at the sandbox boundary.
import {getSolarEphemeris} from './solar-ephemeris.js';
import {worldCoordinates} from './solar-system-clock.js';
import {planetSpecs} from './solar-catalog.js';

const referenceAU = {
  mercury:[0.047959651626, 0.303161889615, 0.020376651693],
  venus:[-0.531076427796, 0.482428747067, 0.037270691319],
  earth:[-0.540789263351, -0.854915766526, 0.000052018045],
  mars:[1.380389484491, 0.240381251646, -0.028810584985],
  jupiter:[-2.651996445048, 4.543818325489, 0.040459653926],
  saturn:[9.412333564228, 1.023890906836, -0.392498617414],
  uranus:[9.403782089303, 17.043308210166, -0.058635646926],
  neptune:[29.857699369897, 0.954457685053, -0.707708761517],
};
const moonOffset=[0.000062379024,0.002397512493,0.000192102199];
referenceAU.moon=referenceAU.earth.map((n,i)=>n+moonOffset[i]);
const radii=Object.fromEntries(planetSpecs.map(s=>[s.key,s.trueRadiusKm]));
radii.moon=1737.4;
const mirror = ([x,y,z]) => [x,y,-z];
const original = Object.fromEntries(Object.entries(referenceAU).map(([key,p])=>[key,mirror(worldCoordinates(p))]));

export function convertCourierFlight(snapshot, direction, epoch=Date.now()) {
  if (!snapshot || !Array.isArray(snapshot.position)) return snapshot;
  const live=Object.fromEntries(Object.entries(getSolarEphemeris(epoch).positionsAU).map(([key,p])=>[key,worldCoordinates(p)]));
  const entering=direction==='live';
  const [from,to]=entering?[original,live]:[live,original];
  let anchor=null, bestKm=Infinity;
  for (const key of Object.keys(radii)) {
    const r=from[key], p=snapshot.position;
    const km=Math.hypot(p[0]-r[0],p[1]-r[1],p[2]-r[2]);
    if(km<radii[key]*48 && km<bestKm){anchor=key;bestKm=km;}
  }
  let position=mirror(snapshot.position);
  if(anchor){
    const offset=mirror(snapshot.position.map((n,i)=>n-from[anchor][i]));
    position=offset.map((n,i)=>to[anchor][i]+n);
  }
  const yaw=Math.atan2(Math.sin(snapshot.yaw),-Math.cos(snapshot.yaw));
  return {...snapshot,position,yaw};
}
