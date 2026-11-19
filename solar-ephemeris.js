// Positions are geometric heliocentric J2000 ecliptic AU; the Moon also has
// a separate Earth-centred vector. Callers choose their own render axes.
import released from './ephemerides/horizons.json' with {type:'json'};
import {AstroTime, GeoMoon, HelioVector, RotateVector, Rotation_EQJ_ECL} from './node_modules/astronomy-engine/esm/astronomy.js';
import {APP_AGENT, BODIES, DAY_MS, horizonsURL, newWindow, parseHorizons, sampleWindow, validWindow} from './solar-horizons.js';

const FEED = 'https://raw.githubusercontent.com/docker3sys/orbit_escape/release/android-1.3/ephemerides/horizons.json';
const STORAGE = 'orbit-escape.horizons.v1';
const RETRY = 'orbit-escape.horizons.retry.v1';
const rotation = Rotation_EQJ_ECL();
const labels = {network:'NASA/JPL · интернет', cache:'NASA/JPL · кэш',
  bundled:'NASA/JPL · в сборке', calculated:'Автономный расчёт'};
let loadedStorage = false;
let cached = null;
let mode = 'cache';
let inFlight;
let nextTry = 0;
let modelInterval;

function read(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch (_) { /* The session cache is sufficient. */ }
}
function loadCache() {
  if (loadedStorage) return;
  loadedStorage = true;
  try {
    const stored = JSON.parse(read(STORAGE));
    if (stored && validWindow(stored.packet) && Number.isFinite(stored.fetchedAtMs)) cached = stored;
  } catch (_) { /* A corrupt/inaccessible save doesn't prevent flight. */ }
  const retry = Number(read(RETRY));
  // Read separately from the table: interrupted updates can leave only this key.
  if (Number.isFinite(retry) && retry <= Date.now() + 15 * DAY_MS) nextTry = retry;
}
function covers(packet, timeMs) {
  return packet && timeMs >= packet.startMs && timeMs <= packet.endMs;
}

function modelAt(timeMs) {
  const time = new AstroTime(new Date(timeMs));
  const vectors = {};
  for (const [key] of BODIES) {
    const planet = key[0].toUpperCase() + key.slice(1);
    const equatorial = key === 'moon' ? GeoMoon(time) : HelioVector(planet,time);
    const v = RotateVector(rotation,equatorial);
    vectors[key] = [v.x,v.y,v.z];
  }
  return vectors;
}

function offlineAt(timeMs) {
  // Evaluate the VSOP/lunar series once per five-minute segment. The clock
  // remains continuous between evaluations even on a 120 Hz display.
  const interval = 300000;
  const start = Math.floor(timeMs/interval)*interval;
  if (!modelInterval || modelInterval.start !== start) {
    const a = modelInterval && modelInterval.start + interval === start ? modelInterval.b : modelAt(start);
    modelInterval = {start, a, b:modelAt(start + interval)};
  }
  const t = (timeMs-start)/interval, positionsAU = {};
  let moonRelativeAU;
  for (const [key] of BODIES) {
    const a = modelInterval.a[key], b = modelInterval.b[key];
    const v = a.map((n, axis) => n + (b[axis]-n)*t);
    if (key === 'moon') {
      moonRelativeAU = v;
      positionsAU.moon = v.map((n, axis) => positionsAU.earth[axis] + n);
    } else positionsAU[key] = v;
  }
  return {positionsAU, moonRelativeAU};
}

export function getSolarEphemeris(epochMs=Date.now()) {
  loadCache();
  const cachedNow = cached && covers(cached.packet,epochMs);
  const packet = cachedNow ? cached.packet : covers(released,epochMs) ? released : null;
  const status = cachedNow ? mode : packet ? 'bundled' : 'calculated';
  const state = packet ? sampleWindow(packet,epochMs) : offlineAt(epochMs);
  return {positionsAU:state.positionsAU, moonRelativeAU:state.moonRelativeAU,
    source:packet ? 'jpl' : 'offline', mode:status, label:labels[status], epochMs,
    fetchedAtMs:cachedNow ? cached.fetchedAtMs : packet ? packet.generatedMs : null,
    startMs:packet ? packet.startMs : null, endMs:packet ? packet.endMs : null};
}

function bridge() {
  if (typeof window === 'undefined') return null;
  const cap = window.Capacitor;
  return cap && typeof cap.nativePromise === 'function' && cap.getPlatform &&
    cap.getPlatform() === 'android' ? cap : null;
}

// Native HTTP is built into Capacitor. NASA disallows embedding its API in a
// website, so browser clients only request the publisher's static CORS feed.
async function androidGet(cap, url) {
  const result = await cap.nativePromise('CapacitorHttp','get',{
    url, headers:{'User-Agent':APP_AGENT}, connectTimeout:5000, readTimeout:9000,
    disableRedirects:true, responseType:'json',
  });
  if (!result || result.status !== 200) throw new Error('Ephemeris HTTP failure');
  return typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
}

async function fetchDirect(cap, now) {
  const start = Math.floor(now/DAY_MS)*DAY_MS - DAY_MS;
  const end = start + 16*DAY_MS;
  const packet = newWindow(start,end,now);
  const deadline = Date.now() + 90000;
  for (const [key, id] of BODIES) {
    if (Date.now() >= deadline) throw new Error('Ephemeris deadline');
    const hours = key === 'moon' ? 6 : 24;
    const data = await androidGet(cap, horizonsURL(id,start,end,hours));
    packet.series[key] = parseHorizons(data,id,start,end,hours);
  }
  return packet;
}

function publicFeed(cap) {
  if (cap) return androidGet(cap,FEED);
  // XHR.timeout also works on early WebViews without AbortSignal.timeout.
  return new Promise((resolve,reject) => {
    const req = new XMLHttpRequest();
    req.open('GET', FEED);
    req.timeout = 8500;
    req.onload = () => {
      if (req.status !== 200 || req.responseText.length > 1500000) {
        reject(new Error('Feed unavailable'));
        return;
      }
      try { resolve(JSON.parse(req.responseText)); } catch (error) { reject(error); }
    };
    req.onerror = req.ontimeout = req.onabort = () => reject(new Error('Feed unavailable'));
    req.send();
  });
}

async function update(cap,now) {
  let packet;
  let direct = false;
  if (cap) {
    try { packet = await fetchDirect(cap,now); direct = true; } catch (_) { /* Try the release feed. */ }
  }
  if (!packet) packet = await publicFeed(cap);
  if (!validWindow(packet) || !covers(packet,now)) throw new Error('No current ephemeris');
  cached = {packet, direct, fetchedAtMs:Date.now()};
  mode = 'network';
  write(STORAGE,JSON.stringify(cached));
  // A mirror used after a native outage may be rechecked in a day. Each JPL
  // download spans 16 days, so a single anonymous install does not poll it.
  nextTry = Math.min(packet.endMs - DAY_MS, now + (direct ? 12 : cap ? 1 : 14)*DAY_MS);
  nextTry = Math.max(now + 3600000, nextTry);
  write(RETRY,String(nextTry));
}

export function refreshSolarEphemeris() {
  loadCache();
  const now = Date.now();
  const cap = bridge();
  const portable = typeof location === 'undefined' || location.protocol === 'file:' ||
    (typeof window !== 'undefined' && !!window.__orbitPortableAssets);
  if (inFlight) return inFlight;
  if ((!cap && portable) || (typeof navigator !== 'undefined' && navigator.onLine === false) ||
      now < nextTry) return Promise.resolve(getSolarEphemeris(now));
  // Save a conservative retry deadline before starting a partial transaction.
  // A killed background app doesn't redownload the same nine vectors in a loop.
  nextTry = now + 6*3600000;
  write(RETRY,String(nextTry));
  inFlight = update(cap,now).catch(() => {}).then(() => {
    inFlight = null;
    return getSolarEphemeris();
  });
  return inFlight;
}
