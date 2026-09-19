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
const categoryFilterKeys = new Set(['prev_first_raw_type', 'prev_second_raw_type', 'prev_third_raw_type', 'prev_last_raw_type', 'prev_raw_signature']);
const ordinalFilterKeys = new Set(['next_ordinal', 'recorded_next_ordinal']);
const numericFilterKeys = new Set(['next_ordinal', 'recorded_next_ordinal', 'prev_first_main_payout', 'prev_main_count', 'daily_single_count', 'daily_intermediate_failures', 'previous_same_first_type_run', 'sessions_since_single']);
const gameFilterKeys = new Set(['day_g', 'recent_net', 'recent_hits']);
const recentFilterKeys = new Set(['recent_net', 'recent_hits']);

function gameFilter(key, item) {
  if (!record(item) || !['all', 'range', 'missing'].includes(item.mode)) fail();
  const lo = string(item.lo, 24, true), hi = string(item.hi, 24, true);
  if (item.mode !== 'range' && (lo || hi)) fail();
  if ([lo, hi].some(v => v && (!Number.isFinite(Number(v)) || Math.abs(Number(v)) > 100000000 ||
      key !== 'recent_net' && (Number(v) < 0 || !Number.isSafeInteger(Number(v))))) || lo && hi && Number(lo) >= Number(hi)) fail();
  if (!recentFilterKeys.has(key) || item.mode === 'all') {
    if (Object.hasOwn(item, 'windowG')) fail();
    return { mode: item.mode, lo, hi };
  }
  const windowG = item.windowG === undefined ? 1000 : integer(item.windowG, 100000);
  if (windowG < 1) fail();
  return { mode: item.mode, lo, hi, windowG };
}

function hypothesisFilter(key, item) {
  if ((!categoryFilterKeys.has(key) && !numericFilterKeys.has(key)) || !record(item)) fail();
  const lo = string(item.lo, 24, true), hi = string(item.hi, 24, true);
  if (item.mode === 'all' || item.mode === 'missing') {
    if (lo || hi) fail();
    return { mode: item.mode, lo: '', hi: '' };
  }
  if (item.mode === 'category') {
    if (!categoryFilterKeys.has(key) || lo || hi) fail();
    const value = string(item.value, 200);
    if (/[\u007f-\u009f]/.test(value)) fail();
    return { mode: 'category', lo: '', hi: '', value };
  }
  if (item.mode === 'modulo') {
    if (!ordinalFilterKeys.has(key) || lo || hi) fail();
    const period = integer(item.period, 6), remainder = integer(item.remainder, period - 1);
    if (period < 2) fail();
    return { mode: 'modulo', lo: '', hi: '', period, remainder };
  }
  if (item.mode !== 'range' || !numericFilterKeys.has(key)) fail();
  if ([lo, hi].some(v => v && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 100000000 ||
      key !== 'prev_first_main_payout' && !Number.isSafeInteger(Number(v)))) || lo && hi && Number(lo) >= Number(hi)) fail();
  return { mode: 'range', lo, hi };
}

function definition(value) {
  if (!record(value) || value.schema !== 'interval-target/v1' || value.hallId !== 'shinjuku' || !['46/52', '50/50'].includes(value.rate) || value.stopRule !== 'evlive' || !record(value.filters)) fail();
  const startG = integer(value.startG, 100000), endG = value.endG === null ? null : integer(value.endG, 100000);
  if (endG !== null && endG <= startG) fail();
  const filters = {};
  for (const key of Object.keys(value.filters).sort()) {
    const item = value.filters[key];
    if (record(item) && Object.hasOwn(item, 'windowG') && !recentFilterKeys.has(key)) fail();
    if (gameFilterKeys.has(key)) { filters[key] = gameFilter(key, item); continue; }
    if (!filterKeys.has(key)) { filters[key] = hypothesisFilter(key, item); continue; }
    if (!record(item) || !['all', 'range', 'missing'].includes(item.mode)) fail();
    const lo = string(item.lo, 24, true), hi = string(item.hi, 24, true);
    if ([lo, hi].some(v => v && !Number.isFinite(Number(v))) || lo && hi && Number(lo) >= Number(hi)) fail();
    filters[key] = { mode: item.mode, lo, hi };
  }
  return { schema: 'interval-target/v1', machineId: matching(value.machineId, /^[a-z0-9]{1,40}$/), hallId: 'shinjuku', profileKey: matching(value.profileKey, /^[a-z0-9_]{1,40}$/), startG, endG, filters, rate: value.rate, stopRule: 'evlive' };
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
    const metrics = {};
    for (const key of ['inv', 'playG']) {
      if (!Object.hasOwn(row, key)) continue;
      const value = row[key];
      if (value !== null && (!Number.isFinite(value) || value < 0 || n === 0)) fail();
      metrics[key] = value;
    }
    return { g, ev: row.ev, n, days, ...metrics };
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
    if (!record(item) || seen.has(item.id) || !['46/52', '50/50'].includes(item.rate) || (item.assumedPayout !== undefined && typeof item.assumedPayout !== 'boolean')) fail();
    seen.add(item.id);
    const config = definition(item.definition);
    if (item.machineId !== config.machineId || item.hallId !== config.hallId || item.rate !== config.rate) fail();
    const rows = parseTargetRows(item.rows);
    if (config.endG !== null && rows.some(row => row.g >= config.endG)) fail();
    return {
      id: id(item.id), name: string(item.name, 80), machineId: config.machineId, hallId: config.hallId,
      conditionKey: hash(item.conditionKey), publicationKey: hash(item.publicationKey), definition: config,
      machine: string(item.machine, 150), profile: string(item.profile, 200), conditions: string(item.conditions, 3000, true),
      stopping: string(item.stopping, 3000), rate: config.rate, dataThrough: date(item.dataThrough),
      sourceRevision: hash(item.sourceRevision), updatedAt: time(item.updatedAt), rows,
      ...(item.assumedPayout === undefined ? {} : { assumedPayout: item.assumedPayout }),
    };
  });
  return { schema: 'evlive-saved-targets/v1', updatedAt: time(value.updatedAt), targets };
}

/** Fill an older collector's omitted means only from the identical calculation. */
function refreshedRows(target, latest) {
  if (latest.sourceRevision !== target.sourceRevision || latest.dataThrough !== target.dataThrough) return latest.rows;
  const snapshots = new Map(target.rows.map(row => [row.g, row]));
  return latest.rows.map(row => {
    const snapshot = snapshots.get(row.g);
    if (!snapshot || snapshot.ev !== row.ev || snapshot.n !== row.n || snapshot.days !== row.days) return row;
    const metrics = {};
    for (const key of ['inv', 'playG']) {
      if (row[key] === undefined && snapshot[key] !== undefined) metrics[key] = snapshot[key];
    }
    return { ...row, ...metrics };
  });
}

/** The catalog alone controls membership; stale collector entries cannot reattach a target. */
export function selectSavedTargets(catalog, machineId, hallId, refreshed = [], replaySource) {
  // null means an advertised source could not be validated. undefined is only
  // for historical machines which have never supplied an interval attachment.
  if (replaySource === null) return [];
  return catalog.targets.filter(target => target.machineId === machineId && target.hallId === hallId).flatMap(target => {
    const latest = refreshed.find(item => item.id === target.id && item.conditionKey === target.conditionKey && item.dataThrough >= target.dataThrough &&
      (replaySource === undefined || item.sourceRevision === replaySource) &&
      (target.definition.endG === null || item.rows.every(row => row.g < target.definition.endG)));
    // A skipped refresh can mean that the EVLIVE rule or selected condition is
    // no longer supported. Never replace it with cashflows from an older rule.
    if (!latest && replaySource !== undefined && target.sourceRevision !== replaySource) return [];
    return [{ ...target, rows: latest ? refreshedRows(target, latest) : target.rows, dataThrough: latest?.dataThrough ?? target.dataThrough, sourceRevision: latest?.sourceRevision ?? target.sourceRevision, refreshed: Boolean(latest) }];
  });
}

/** Read only public revision metadata; ciphertext is never copied to the page. */
export function savedTargetReplaySource(machine, hallId) {
  if (!record(machine) || machine.intervalExplorer === undefined) return undefined;
  const source = machine.intervalExplorer;
  if (!record(source) || source.schema !== 'evlive-interval-envelope/v1' ||
      source.id !== machine.id || source.hallId !== hallId ||
      typeof source.sourceRevision !== 'string' || !/^[a-f0-9]{64}$/.test(source.sourceRevision)) return null;
  return source.sourceRevision;
}
