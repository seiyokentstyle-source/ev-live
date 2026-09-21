import { gunzipSync, gzipSync } from 'node:zlib';
import { aggregateFilterTable } from './ev/filter-aggregation-core.mjs';
import { validateAggregateMatchModes, validateAggregateRows } from './ev/filter-aggregation-validation-core.mjs';

const TARGET = /^cz_ceiling_(4652|5050)$/;
const RATE_LABEL = { '4652': '46/52', '5050': '50/50' };
const fail = message => { throw new Error(`Invalid CZ cohort aggregation: ${message}`); };

function decodeRows(data, axes) {
  if (data.schema !== 'evlive-filter-aggregates/v1' ||
      JSON.stringify(data.axisKeys) !== JSON.stringify(axes.map(axis => axis.key))) fail('axis contract');
  for (const field of ['costPerGame', 'exchange', 'medalsPerGame', 'bet']) {
    if (!Number.isFinite(data[field]) || data[field] <= 0) fail(field);
  }
  if (!Number.isFinite(data.junzou) || data.junzou < 0) fail('junzou');
  if (!['mean', 'total'].includes(data.investmentMinimum)) fail('investmentMinimum');
  if (data.minPlay !== undefined && (!Number.isFinite(data.minPlay) || data.minPlay < 0)) fail('minPlay');
  if (!Number.isFinite(data.roundingEpsilon) || data.roundingEpsilon < 0 || data.roundingEpsilon >= 0.25) fail('roundingEpsilon');
  validateAggregateMatchModes(data.axisMatchModes, axes);
  if (data.rows !== undefined) {
    if (data.rowsGzip !== undefined || data.rowCount !== undefined || data.rowsAsset !== undefined) fail('conflicting row payloads');
    return validateAggregateRows(data.rows, axes, undefined, data.axisMatchModes);
  }
  if (data.rowsAsset !== undefined) {
    if (data.rowsGzip !== undefined || data.rowCount !== undefined) fail('conflicting row payloads');
    // Already-public assets cannot be reconstructed synchronously at this boundary.
    return undefined;
  }
  if (typeof data.rowsGzip !== 'string' || data.rowsGzip.length === 0 || data.rowsGzip.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data.rowsGzip)) fail('rowsGzip must be base64');
  if (!Number.isSafeInteger(data.rowCount) || data.rowCount < 0) fail('row count');
  let rows;
  try {
    rows = JSON.parse(gunzipSync(Buffer.from(data.rowsGzip, 'base64'), { maxOutputLength: 256 * 1024 * 1024 }).toString('utf8'));
  } catch {
    fail('compressed rows could not be decoded');
  }
  return validateAggregateRows(rows, axes, data.rowCount, data.axisMatchModes);
}

function splitProfile(profile) {
  const match = TARGET.exec(profile.key);
  const data = profile.evFilters?.aggregation;
  if (!match || !data || profile.dataPending) return [profile];
  const axes = profile.evFilters.axes;
  if (!Array.isArray(axes) || axes.some(axis => !axis || typeof axis.key !== 'string' || !Array.isArray(axis.options))) fail('declared axes');
  if (new Set(axes.map(axis => axis.key)).size !== axes.length) fail('duplicate axes');
  for (const axis of axes) {
    if (axis.options.some(option => !option || typeof option.value !== 'string') ||
        new Set(axis.options.map(option => option.value)).size !== axis.options.length) fail('axis options');
  }
  const rows = decodeRows(data, axes);
  const czIndex = axes.findIndex(axis => axis.key === 'cz');
  // Old publications without a usable CZ axis keep their original table intact.
  if (!rows || czIndex < 0) return [profile];
  if ((data.axisMatchModes?.[czIndex] ?? 'single') !== 'single') fail('CZ must use exact option indexes');
  const cz = axes[czIndex];
  if (cz.options.some(option => !/^(0|[1-9]\d*)$/.test(option.value) || !Number.isSafeInteger(Number(option.value)))) fail('CZ counts');
  const zeroIndex = cz.options.findIndex(option => option.value === '0');
  const positiveIndexes = cz.options.flatMap((option, index) => Number(option.value) > 0 ? [index] : []);
  if (zeroIndex < 0 || positiveIndexes.length === 0) return [profile];
  // Unknown CZ counts cannot be assigned to either group without losing samples.
  if (rows.some(row => row[czIndex + 1] < 0 && row[axes.length + 1] > 0)) return [profile];
  const positiveMap = new Map(positiveIndexes.map((index, next) => [index, next]));
  const scopedRows = rows.filter(row => row[0] >= profile.gRange.start && row[0] <= profile.gRange.end);
  const { rows: _rows, rowsGzip: _gzip, rowCount: _count, rowsAsset: _asset, ...parameters } = data;

  return [true, false].map(zero => {
    const nextAxes = zero ? axes.filter((_, index) => index !== czIndex)
      : axes.map((axis, index) => index === czIndex
        ? { ...axis, allLabel: '1スルー以降すべて', options: positiveIndexes.map(option => axis.options[option]) } : axis);
    const nextRows = scopedRows.filter(row => zero ? row[czIndex + 1] === zeroIndex : positiveMap.has(row[czIndex + 1]))
      .map(row => zero ? row.filter((_, index) => index !== czIndex + 1)
        : row.map((value, index) => index === czIndex + 1 ? positiveMap.get(value) : value));
    const modes = data.axisMatchModes;
    const decoded = { ...parameters, axisKeys: nextAxes.map(axis => axis.key),
      ...(modes ? { axisMatchModes: zero ? modes.filter((_, index) => index !== czIndex) : [...modes] } : {}), rows: nextRows };
    const table = aggregateFilterTable(decoded, nextAxes, {}, profile.gRange.start);
    const { sessions: _sessions, firstHitRate: _firstHitRate, totalPayout: _payout,
      sampleNote: _note, ev: _samples, ...rest } = profile;
    const { rows: _decodedRows, ...nextParameters } = decoded;
    return { ...rest, key: `cz_ceiling_${zero ? 'zero' : 'after'}_${match[1]}`,
      label: `CZ間（${zero ? '0スルー' : '1スルー以降'}）・${RATE_LABEL[match[1]]}`,
      // A rounded zero-yen result is neutral under the public EV/RTP sign contract.
      baseAnchors: table.baseAnchors.map(anchor => anchor.ev === 0 ? { ...anchor, rtp: 100 } : anchor),
      gRange: { ...profile.gRange, start: table.start, end: table.end },
      zones: profile.zones.filter(zone => zone.g >= table.start && zone.g <= table.end),
      sampleNote: zero ? 'CZ0スルーの区間のみ。対象件数は各開始Gのサンプル数に表示。'
        : 'CZ1スルー以降の区間のみ。対象件数は各開始Gのサンプル数に表示。',
      ...(table.baseAnchors.length === 0 ? { dataPending: true, pendingReason: 'このCZスルー条件で集計できるデータがありません。' } : {}),
      evFilters: { ...profile.evFilters, axes: nextAxes, tables: {}, aggregation: {
        ...nextParameters, rowsGzip: gzipSync(JSON.stringify(nextRows)).toString('base64'), rowCount: nextRows.length
      } }
    };
  });
}

function splitProfiles(profiles) {
  const keys = new Set(profiles.map(profile => profile.key));
  return profiles.flatMap(profile => {
    const split = splitProfile(profile);
    if (split.length > 1 && split.some(candidate => keys.has(candidate.key))) fail('split profile key already exists');
    return split;
  });
}

/** Derive separate normal CZ tables from published sums; never read private history. */
export function splitCzThroughProfiles(machine) {
  if (machine.id !== 'vvv2') return machine;
  return { ...machine, profiles: splitProfiles(machine.profiles),
    ...(machine.setting1Correction ? { setting1Correction: { ...machine.setting1Correction,
      profiles: splitProfiles(machine.setting1Correction.profiles) } } : {}) };
}
