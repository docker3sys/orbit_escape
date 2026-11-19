import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {BODIES, DAY_MS, horizonsURL, newWindow, parseHorizons, validWindow} from '../solar-horizons.js';
import {getSolarEphemeris} from '../solar-ephemeris.js';

const AU_KM = 149597870.7;
const epoch = Date.parse('2026-11-19T06:00:00Z');
const distanceKm = (v, reference) => Math.hypot(...v.map((n,i) => n-reference[i]))*AU_KM;
const data = JSON.parse(await readFile(new URL('../ephemerides/horizons.json',import.meta.url)));

test('bundled table uses heliocentric planets and a separately interpolated geocentric Moon',() => {
  assert.equal(validWindow(data),true);
  const state = getSolarEphemeris(epoch);
  // Independent Horizons TLIST query 2461363.75 UT, with no light-time correction.
  assert.equal(state.mode,'bundled');
  assert.ok(distanceKm(state.positionsAU.earth,[.5449140217847888,.8245876751405141,-.00005544748181328748]) < 20);
  assert.ok(distanceKm(state.moonRelativeAU,[.002525413359459673,-.0005977345888667457,.0000854712240485483]) < .5);
  const geocentric = state.positionsAU.moon.map((n,i) => n-state.positionsAU.earth[i]);
  assert.ok(distanceKm(geocentric,state.moonRelativeAU) < .0001);
  const moved = getSolarEphemeris(epoch+1000).positionsAU.earth;
  const speed = distanceKm(moved,state.positionsAU.earth);
  assert.ok(speed > 28 && speed < 32);
});

test('an epoch outside the table uses the offline astronomical model',() => {
  // Independent Horizons TLIST query 2463297.75 UT, from the same reference frame.
  const state = getSolarEphemeris(Date.parse('2032-03-06T06:00:00Z'));
  assert.equal(state.mode,'calculated');
  assert.ok(distanceKm(state.positionsAU.earth,[-.9617230221111791,.2437687134868150,-.00001327312983516356]) < 1000);
  assert.ok(distanceKm(state.moonRelativeAU,[.00003705790099985376,-.002475589816722298,.0001699700336084237]) < 30);
});

test('Horizons validates the requested body, frame and UTC sample dates',() => {
  const start = Date.parse('2026-11-19T00:00:00Z'), end = start+DAY_MS;
  const response = {signature:{source:'NASA/JPL Horizons API',version:'1.2'},result:[
    'Target body name: Moon (301)', 'Center body name: Earth (399)', 'Output units : AU-D',
    'Output type : GEOMETRIC cartesian states','Reference frame : Ecliptic of J2000.0',
    ' JDUT , Calendar Date (UT), X,Y,Z,VX,VY,VZ', '$$SOE',
    '2461363.5, epoch, .0025,-.0007,.00007,.0001,.0005,.000047,',
    '2461364.5, epoch, .0026,-.0002,.0001,0,.0006,.00004,', '$$EOE'].join('\n')};
  assert.equal(parseHorizons(response,301,start,end,24).values.length,12);
  for (const [a,b] of [['Earth (399)','Sun (10)'],['JDUT','JDTDB'],
      ['Ecliptic of J2000.0','ICRF'],['2461364.5','2461365.5']]) {
    assert.throws(() => parseHorizons({...response,result:response.result.replace(a,b)},301,start,end,24));
  }
  const url = new URL(horizonsURL(301,start,end,6));
  assert.equal(url.searchParams.get('CENTER'),'500@399');
  assert.equal(url.searchParams.get('TIME_TYPE'),'UT');
  assert.equal(validWindow(newWindow(start,end,start)),false);
});

test('an interrupted refresh preserves the bundled solution and backs off across a restart',async () => {
  const now = Date.now, oldWindow = globalThis.window, oldStorage = globalThis.localStorage;
  const store = new Map();
  let attempts = 0;
  try {
    Date.now = () => epoch;
    globalThis.localStorage = {getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
    globalThis.window = {Capacitor:{getPlatform:()=>'android',
      nativePromise:async () => { attempts++; throw new Error('network unavailable'); }}};
    const game = await import('../solar-ephemeris.js?failedLoad');
    assert.equal((await game.refreshSolarEphemeris()).mode,'bundled');
    assert.equal(attempts,2); // Direct request, then the publisher's static fallback.
    const restart = await import('../solar-ephemeris.js?failedRestart');
    assert.equal((await restart.refreshSolarEphemeris()).mode,'bundled');
    assert.equal(attempts,2);
  } finally {
    Date.now = now;
    if (oldStorage) globalThis.localStorage=oldStorage; else delete globalThis.localStorage;
    if (oldWindow) globalThis.window=oldWindow; else delete globalThis.window;
  }
});

test('a valid cached table is reused after restart, including its 12-day direct refresh deadline',async () => {
  const now = Date.now, oldWindow = globalThis.window, oldStorage = globalThis.localStorage;
  let attempts = 0;
  try {
    Date.now = () => epoch;
    const entries = new Map([
      ['orbit-escape.horizons.v1',JSON.stringify({packet:data,direct:true,fetchedAtMs:epoch})],
      ['orbit-escape.horizons.retry.v1',String(epoch+12*DAY_MS)],
    ]);
    globalThis.localStorage = {getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v)};
    globalThis.window = {Capacitor:{getPlatform:()=>'android',nativePromise:async()=>{attempts++;}}};
    const game = await import('../solar-ephemeris.js?cachedRestart');
    assert.equal((await game.refreshSolarEphemeris()).mode,'cache');
    assert.equal(attempts,0);
    assert.equal(Object.keys(game.getSolarEphemeris(epoch).positionsAU).length,BODIES.length);
  } finally {
    Date.now = now;
    if (oldStorage) globalThis.localStorage=oldStorage; else delete globalThis.localStorage;
    if (oldWindow) globalThis.window=oldWindow; else delete globalThis.window;
  }
});
