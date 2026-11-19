import test from 'node:test';
import assert from 'node:assert/strict';
import {convertCourierFlight} from "../courier-flight-frame.js";
import { createOrbitalClock, orbitPaths, orbitalDrift, worldCoordinates } from '../solar-system-clock.js';
import { angularDiameter, HULL_CLEARANCE_KM, arrivalRangeKm } from '../solar-scale.js';

const epoch = Date.UTC(2026,10,19,6);
const distance = (a,b) => Math.hypot(...a.map((x,i)=>x-b[i]));
test('ecliptic north maps up and east maps toward negative Z', () => {
  assert.deepEqual(worldCoordinates([1,2,3]),[149597870.7,3*149597870.7,-2*149597870.7]);
});

test('a hovering ship stays 50 m above the Moon across elapsed time, including suspend', () => {
  const clock=createOrbitalClock();
  const first=clock.update(epoch,[0,0,0]);
  const eye = first.positions.moon.slice();
  eye[1]+=1737.45;
  assert.equal(clock.update(epoch+100,eye),null);
  const next=clock.update(epoch+72000000,eye);
  const transferred=eye.map((x,i)=>x+next.drift[i]);
  assert.ok(Math.abs(distance(next.positions.moon,transferred)-1737.45)<0.000001);
  assert.deepEqual(orbitalDrift(first.positions,next.positions,[0,0,0]),[0,0,0]);
});

test('physical disks, hull and jump altitudes use kilometres', () => {
  const {positions} = createOrbitalClock().update(epoch,[0,0,0]);
  const toDegrees=angle=>angle*180/Math.PI;
  const sun=toDegrees(angularDiameter(695700,distance(positions.earth,[0,0,0])));
  const earth=toDegrees(angularDiameter(6371,distance(positions.earth,positions.moon)));
  assert.ok(sun>0.51 && sun<0.55);
  assert.ok(earth>1.75 && earth<2.12);
  assert.ok(HULL_CLEARANCE_KM>0.0037 && HULL_CLEARANCE_KM<0.004);
  assert.equal(arrivalRangeKm(1737.4,'surface','moon'),1737.45);
});

test('optional orbit guides are in the same world basis as the planets', () => {
  const {positions} = createOrbitalClock().update(epoch,[0,0,0]);
  const guides=orbitPaths(epoch,256);
  assert.equal(Object.keys(guides).length,8);
  for (const [key,points] of Object.entries(guides)) {
    const scale=distance(positions[key],[0,0,0]);
    assert.ok(Math.min(...points.map(p=>distance(p,positions[key])))/scale<0.015,key);
  }
});

test('legacy courier pilot at lunar orbit can switch to live Canvas and back without losing the flight', () => {
  const {positions}=createOrbitalClock().update(epoch,[0,0,0]);
  const pin={position:positions.moon.map((n,i)=>n+[200,-10,8050][i]),yaw:-.6,pitch:.35,target:'moon'};
  const legacy=convertCourierFlight(pin,'legacy',epoch), restored=convertCourierFlight(legacy,'live',epoch+86400000);
  const next=createOrbitalClock().update(epoch+86400000,[0,0,0]).positions.moon;
  assert.ok(distance(restored.position,next.map((n,i)=>n+[200,-10,8050][i]))<1e-6);
  assert.ok(Math.abs(restored.yaw-pin.yaw)<1e-10);
  assert.equal(restored.target,'moon');
});
