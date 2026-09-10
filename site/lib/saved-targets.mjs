const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = () => { throw new Error('Invalid saved target data'); };
const string = (value, max, empty = false) => {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /[\u0000-\u001f]/.test(value)) fail();
  return value;
};
const matching = (value, pattern) => { if (typeof value !== 'string' || !pattern.test(value)) fail(); return value; };
const id = (value) => matching(value, /^[a-f0-9-]{36}$/);
const hash = (value) => matching(value, /^[a-f0-9]{64}$/);
const date = (value) => matching(value, /^\d{4}-\d{2}-\d{2}$/);
const time = (value) => { string(value, 40); if (!Number.isFinite(Date.parse(value))) fail(); return value; };
const integer = (value, max = 100000000) => { if (!Number.isSafeInteger(value) || value < 0 || value > max) fail(); return value; };
const filterKeys = new Set(['h', 'y', 'n', 'm', 'g', 'past_y', 'cz', 'bb', 'rb', 'prev_cz']);

function definition(value) {
  if (!record(value) || value.schema !== 'interval-target/v1' || value.hallId !== 'shinjuku' || value.rate !== '46/52' || value.stopRule !== 'evlive' || !record(value.filters)) fail();
  const startG = integer(value.startG, 100000), endG = value.endG === null ? null : integer(value.endG, 100000);
  if (endG !== null && endG <= startG) fail();
  const filters = {};
  for (const key of Object.keys(value.filters).sort()) {
    const item = value.filters[key];
    if (!filterKeys.has(key) || !record(item) || !['all', 'range', 'missing'].includes(item.mode)) fail();
    const lo = string(item.lo, 24, true), hi = string(item.hi, 24, true);
    if ([lo, hi].some(v => v && !Number.isFinite(Number(v))) || lo && hi && Number(lo) >= Number(hi)) fail();
    filters[key] = { mode: item.mode, lo, hi };
  }
  return { schema: 'interval-target/v1', machineId: matching(value.machineId, /^[a-z0-9]{1,40}$/), hallId: 'shinjuku', profileKey: matching(value.profileKey, /^[a-z0-9_]{1,40}$/), startG, endG, filters, rate: '46/52', stopRule: 'evlive' };
}

/** Only aggregate values cross into the public feed or a rendered page. */
export function parseTargetRows(value) {
  if (!Array.isArray(value) || value.length > 10001) fail();
  let previous = -1;
  return value.map(row => {
    if (!record(row)) fail();
    const g = integer(row.g, 100000), n = integer(row.n), days = integer(row.days);
    if (g <= previous || days > n || (row.ev !== null && (!Number.isFinite(row.ev) || n === 0))) fail();
    previous = g;
    return { g, ev: row.ev, n, days };
  });
}

export function parseMachineSavedTargets(value) {
  if (!Array.isArray(value) || value.length > 1000) fail();
  const seen = new Set();
  return value.map(item => {
    if (!record(item) || seen.has(item.id)) fail();
    seen.add(item.id);
    return { id: id(item.id), conditionKey: hash(item.conditionKey), sourceRevision: hash(item.sourceRevision), dataThrough: date(item.dataThrough), rows: parseTargetRows(item.rows) };
  });
}

export function parseSavedTargetCatalog(value) {
  if (!record(value) || value.schema !== 'evlive-saved-targets/v1' || !Array.isArray(value.targets) || value.targets.length > 1000) fail();
  const seen = new Set();
  const targets = value.targets.map(item => {
    if (!record(item) || seen.has(item.id) || item.rate !== '46/52' || (item.assumedPayout !== undefined && typeof item.assumedPayout !== 'boolean')) fail();
    seen.add(item.id);
    const config = definition(item.definition);
    if (item.machineId !== config.machineId || item.hallId !== config.hallId) fail();
    const rows = parseTargetRows(item.rows);
    if (config.endG !== null && rows.some(row => row.g >= config.endG)) fail();
    return {
      id: id(item.id), name: string(item.name, 80), machineId: config.machineId, hallId: config.hallId,
      conditionKey: hash(item.conditionKey), publicationKey: hash(item.publicationKey), definition: config,
      machine: string(item.machine, 150), profile: string(item.profile, 200), conditions: string(item.conditions, 3000, true),
      stopping: string(item.stopping, 3000), rate: '46/52', dataThrough: date(item.dataThrough),
      sourceRevision: hash(item.sourceRevision), updatedAt: time(item.updatedAt), rows,
      ...(item.assumedPayout === undefined ? {} : { assumedPayout: item.assumedPayout }),
    };
  });
  return { schema: 'evlive-saved-targets/v1', updatedAt: time(value.updatedAt), targets };
}

/** The catalog alone controls membership; stale collector entries cannot reattach a target. */
export function selectSavedTargets(catalog, machineId, hallId, refreshed = []) {
  return catalog.targets.filter(target => target.machineId === machineId && target.hallId === hallId).map(target => {
    const latest = refreshed.find(item => item.id === target.id && item.conditionKey === target.conditionKey && item.dataThrough >= target.dataThrough &&
      (target.definition.endG === null || item.rows.every(row => row.g < target.definition.endG)));
    return { ...target, rows: latest?.rows ?? target.rows, dataThrough: latest?.dataThrough ?? target.dataThrough, sourceRevision: latest?.sourceRevision ?? target.sourceRevision, refreshed: Boolean(latest) };
  });
}
