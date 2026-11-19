// JPL Horizons geometric vectors, in the fixed J2000 ecliptic plane, AU and AU/day.
// The Moon is requested relative to Earth, preserving precision near the lunar surface.
export const DAY_MS = 86400000;
export const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';
export const APP_AGENT = 'OrbitEscape/1.3 (https://github.com/docker3sys/orbit_escape/issues)';
export const BODIES = [
  ['mercury', 199], ['venus', 299], ['earth', 399], ['mars', 499],
  ['jupiter', 599], ['saturn', 699], ['uranus', 799], ['neptune', 899], ['moon', 301],
];

export function horizonsURL(id, startMs, endMs, stepHours) {
  const day = ms => "'" + new Date(ms).toISOString().slice(0, 10) + "'";
  const fields = {
    format:'json', COMMAND:String(id), CENTER:id === 301 ? '500@399' : '500@10',
    OBJ_DATA:'NO', MAKE_EPHEM:'YES', EPHEM_TYPE:'VECTORS', VEC_TABLE:'2',
    VEC_LABELS:'NO', VEC_CORR:'NONE', CSV_FORMAT:'YES', REF_PLANE:'ECLIPTIC',
    REF_SYSTEM:'ICRF', OUT_UNITS:'AU-D', TIME_TYPE:'UT',
    START_TIME:day(startMs), STOP_TIME:day(endMs), STEP_SIZE:"'" + stepHours + " h'",
  };
  return HORIZONS_URL + '?' + Object.keys(fields).map(key =>
    key + '=' + encodeURIComponent(fields[key])).join('&');
}

export function parseHorizons(data, id, startMs, endMs, stepHours) {
  const raw = data && data.result;
  if (!data || data.error || !data.signature || data.signature.source !== 'NASA/JPL Horizons API' ||
      !['1.2', '1.3'].includes(data.signature.version) || typeof raw !== 'string' || raw.length > 2000000) {
    throw new Error('Unexpected Horizons API response');
  }
  const header = raw.slice(0, raw.indexOf('$$SOE'));
  const bodyID = name => {
    const match = header.match(new RegExp(name + ' body name:[^\\n(]+\\((\\d+)\\)'));
    return match && Number(match[1]);
  };
  if (bodyID('Target') !== id || bodyID('Center') !== (id === 301 ? 399 : 10) ||
      !/Output units\s*:\s*AU-D/.test(header) || !/Ecliptic of J2000\.0/.test(header) ||
      !/GEOMETRIC cartesian states/.test(header) || !/\bJDUT\s*,/.test(header)) {
    throw new Error('Unexpected Horizons coordinate system');
  }
  const block = raw.match(/\$\$SOE\s*([\s\S]*?)\$\$EOE/);
  if (!block) throw new Error('Missing Horizons vectors');
  const rows = block[1].trim().split(/\r?\n/);
  const expectedCount = 1 + (endMs - startMs) / (stepHours * 3600000);
  if (rows.length !== expectedCount) throw new Error('Incomplete Horizons dates');
  const values = [];
  for (let index = 0; index < rows.length; index++) {
    const cells = rows[index].split(',');
    const jd = Number(cells[0]);
    const ms = (jd - 2440587.5) * DAY_MS;
    if (cells.length < 8 || !Number.isFinite(ms) ||
        Math.abs(ms - (startMs + index * stepHours * 3600000)) > 5) {
      throw new Error('Unexpected Horizons epoch');
    }
    for (let field = 2; field < 8; field++) {
      const number = Number(cells[field]);
      if (!cells[field].trim() || !Number.isFinite(number) || Math.abs(number) > 50) {
        throw new Error('Invalid Horizons coordinate');
      }
      values.push(Number(number.toFixed(14)));
    }
  }
  return {stepHours, values};
}

// Each series is [x,y,z,vx,vy,vz] sampled on its own uniform UTC time grid.
export function validWindow(packet) {
  if (!packet || packet.schema !== 1 || packet.source !== 'NASA/JPL Horizons' ||
      !Number.isFinite(packet.startMs) || !Number.isFinite(packet.endMs) ||
      !Number.isFinite(packet.generatedMs) || !packet.series) return false;
  const length = packet.endMs - packet.startMs;
  if (length <= 0 || length > 730 * DAY_MS) return false;
  return BODIES.every(([key]) => {
    const row = packet.series[key];
    if (!row || !Number.isInteger(row.stepHours) || row.stepHours < 1 || row.stepHours > 192 ||
        !Array.isArray(row.values) || row.values.length > 50000 ||
        row.values.length !== (1 + length / (row.stepHours * 3600000)) * 6) return false;
    return row.values.every(n => Number.isFinite(n) && Math.abs(n) < 50);
  });
}

export function newWindow(startMs, endMs, generatedMs) {
  return {schema:1, source:'NASA/JPL Horizons', startMs, endMs, generatedMs, series:{}};
}

export function sampleWindow(window, timeMs) {
  const positionsAU = {};
  let moonRelativeAU;
  for (const [key] of BODIES) {
    const {stepHours, values} = window.series[key];
    const exact = (timeMs - window.startMs) / (stepHours * 3600000);
    const i = Math.max(0, Math.min(Math.floor(exact), values.length / 6 - 2));
    const t = Math.max(0, Math.min(1, exact - i));
    const t2 = t * t, t3 = t2 * t, days = stepHours / 24;
    // Cubic Hermite interpolation uses both endpoint velocities returned by JPL.
    const a = 2*t3 - 3*t2 + 1, b = (t3 - 2*t2 + t)*days;
    const c = -2*t3 + 3*t2, d = (t3 - t2)*days;
    const offset = 6*i;
    const xyz = [0, 1, 2].map(axis => a*values[offset+axis] + b*values[offset+3+axis] +
      c*values[offset+6+axis] + d*values[offset+9+axis]);
    if (key === 'moon') {
      moonRelativeAU = xyz;
      positionsAU.moon = xyz.map((v, axis) => v + positionsAU.earth[axis]);
    } else {
      positionsAU[key] = xyz;
    }
  }
  return {positionsAU, moonRelativeAU};
}
