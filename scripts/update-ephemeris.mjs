// Regenerate the public and bundled table before a release:
// node scripts/update-ephemeris.mjs 2026-10-01 512
import {writeFile, rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {APP_AGENT, BODIES, DAY_MS, horizonsURL, newWindow, parseHorizons, validWindow} from '../solar-horizons.js';

const startMs = Date.parse((process.argv[2] || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');
const days = Number(process.argv[3] || 512);
if (!Number.isFinite(startMs) || !Number.isInteger(days) || days < 4 || days > 720 || days % 4 !== 0) {
  throw new Error('Supply a UTC date and a period divisible by four (4–720 days).');
}
const endMs = startMs + days * DAY_MS;
const packet = newWindow(startMs, endMs, Date.now());
// JPL's fair-use policy requires serial requests, caching and a contact in the UA.
for (const [key, id] of BODIES) {
  const hours = key === 'moon' ? 12 : key === 'mercury' ? 48 : 96;
  const response = await fetch(horizonsURL(id,startMs,endMs,hours), {
    headers:{'User-Agent':APP_AGENT}, signal:AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error('Horizons returned ' + response.status + ' for ' + key);
  packet.series[key] = parseHorizons(await response.json(),id,startMs,endMs,hours);
  console.log(key, packet.series[key].values.length / 6, 'vectors');
}
if (!validWindow(packet)) throw new Error('Invalid generated data');
const destination = fileURLToPath(new URL('../ephemerides/horizons.json', import.meta.url));
const temporary = destination + '.tmp';
await writeFile(temporary, JSON.stringify(packet) + '\n');
await rename(temporary,destination);
