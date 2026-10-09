import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../app/preview/ev-table/machine.json';
import { aggregateFilterTable, roundAggregateEV } from '../lib/ev/filter-aggregation';
import { normalInvestmentMedals, validateNormalCostSchedule } from '../lib/ev/normal-cost-core.mjs';
import { decodeFilterAggregation, clearAggregationDecodeCache } from '../lib/ev/aggregation-decode';
import { externalizeMachineAggregations } from '../lib/filter-aggregate-assets.mjs';
import { validateMachine } from '../lib/ev/validate';
import type { DecodedFilterAggregation, FilterAggregation, Profile } from '../lib/ev/types';

const low = 50 / 31.4, high = 50 / 46, loan = 1000 / 46, exchange = 1000 / 52;
const schedule = [{ fromGame: 0, medalsPerGame: low }, { fromGame: 636, medalsPerGame: high }];
const data: DecodedFilterAggregation = {
  schema: 'evlive-filter-aggregates/v2', axisKeys: [], medalsPerGame: low, normalCostSchedule: schedule,
  costPerGame: low * loan, exchange, junzou: 5, bet: 3, investmentMinimum: 'mean', roundingEpsilon: 1e-8,
  rows: [[630, 1, 3, 10], [630, 2, 20, 60], [630, 1, 100, 200]],
};
function machineWith(aggregation: FilterAggregation) {
  const profile: Profile = { key: 'game_ceiling_4652', label: '通常時・46/52', ceiling: '999G',
    gRange: { start: 630, end: 630, step: 10 }, activeAxes: [], zones: [],
    baseAnchors: [{ g: 630, ev: 100, rtp: 101 }], evFilters: { axes: [], tables: {}, aggregation } };
  return { ...fixture, setting1Correction: undefined, profiles: [profile] };
}
afterEach(() => { clearAggregationDecodeCache(); vi.unstubAllGlobals(); });

describe('normal-game cost schedule', () => {
  it.each([[0, 636, 636 * low], [635, 1, low], [636, 1, high], [635, 2, low + high],
    [637, 10, 10 * high], [635.5, 1, .5 * (low + high)], [600, 0, 0]])(
    'integrates from completed G=%s for %s physical games', (g, play, expected) => {
      expect(normalInvestmentMedals(g, play, low, schedule)).toBeCloseTo(expected, 10);
    });

  it.each([0, 10, 1_000])('caps %s held medals per exact opportunity and retains actual play time', held => {
    const investments = [3 * low, 6 * low + 4 * high, 6 * low + 4 * high, 6 * low + 94 * high];
    const medals = investments.reduce((sum, value) => sum + value, 0);
    const profit = 270 * exchange - medals * loan + investments.reduce((sum, value) => sum + Math.min(held, value), 0) * (loan - exchange);
    const result = aggregateFilterTable(data, [], {}, 630, held).baseAnchors[0];
    expect(result.ev).toBe(roundAggregateEV(profit / 4));
    expect(result.inv).toBeCloseTo(medals / 4, 10);
    expect(result.playG).toBe((123 + 270 / 5) / 4);
    expect(result.rtp).toBeCloseTo(100 + profit / (20 * 3 * (123 + 270 / 5)) * 100, 10);
    expect(result.n).toBe(4);
    if (held === 10) expect(result.ev).not.toBe(roundAggregateEV((270 * exchange - medals * loan) / 4 + Math.min(held, medals / 4) * (loan - exchange)));
  });

  it('uses actual scheduled investment for the one-yen eligibility gate', () => {
    const tiny = { ...data, rows: [[636, 1, .04, 1]] };
    expect(aggregateFilterTable(tiny, [], {}, 636).baseAnchors).toEqual([]);
    expect(aggregateFilterTable({ ...tiny, normalCostSchedule: undefined }, [], {}, 636).baseAnchors).toHaveLength(1);
    expect(aggregateFilterTable({ ...data, minPlay: 31 }, [], {}, 630).baseAnchors).toEqual([]);
  });

  it('keeps equal exchange unchanged by holdings and stops adding benefit when covered', () => {
    const equal = { ...data, costPerGame: low * 20, exchange: 20 };
    expect(aggregateFilterTable(equal, [], {}, 630, 10_000)).toEqual(aggregateFilterTable(equal, [], {}, 630));
    expect(aggregateFilterTable(data, [], {}, 630, 1_000)).toEqual(aggregateFilterTable(data, [], {}, 630, 10_000));
  });

  it('keeps absent-schedule v1 and v2 linear calculations identical', () => {
    const linear = { ...data, normalCostSchedule: undefined };
    const legacy: DecodedFilterAggregation = { ...linear, schema: 'evlive-filter-aggregates/v1', rows: [[630, 4, 123, 270]] };
    expect(aggregateFilterTable(linear, [], {}, 630)).toEqual(aggregateFilterTable(legacy, [], {}, 630));
    expect(normalInvestmentMedals(636, 10, low)).toBe(10 * low);
  });
});

describe('schedule publication contract', () => {
  it.each([null, [], [{ fromGame: 1, medalsPerGame: low }],
    [{ fromGame: 0, medalsPerGame: high }], [...schedule, { fromGame: 636, medalsPerGame: high }],
    [{ fromGame: 0, medalsPerGame: low, extra: true }],
    [{ fromGame: 0, medalsPerGame: low }, { fromGame: Infinity, medalsPerGame: high }],
    [{ fromGame: 0, medalsPerGame: low }, { fromGame: 636, medalsPerGame: 0 }],
    [{ fromGame: false, medalsPerGame: low }]])('rejects malformed metadata %j', invalid => {
    expect(() => validateNormalCostSchedule(invalid, low, data.schema)).toThrow(/normalCostSchedule/);
    expect(() => validateMachine(machineWith({ ...data, normalCostSchedule: invalid } as FilterAggregation))).toThrow(/normalCostSchedule/);
  });

  it('rejects a heterogeneous v1 schedule before any asset fetch or calculation', async () => {
    const legacy: FilterAggregation = { ...data, schema: 'evlive-filter-aggregates/v1' };
    expect(() => validateMachine(machineWith(legacy))).toThrow(/normalCostSchedule/);
    expect(() => aggregateFilterTable(legacy as DecodedFilterAggregation, [], {}, 630)).toThrow(/normalCostSchedule/);
    const { rows: _rows, ...parameters } = legacy;
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(decodeFilterAggregation({ ...parameters, rowsAsset: { sha256: '0'.repeat(64), rowCount: 3 } }, [])).rejects.toThrow(/normalCostSchedule/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves metadata through gzip, external assets and exact browser decoding', async () => {
    const { rows, ...parameters } = data;
    const compressed: FilterAggregation = { ...parameters, rowsGzip: gzipSync(JSON.stringify(rows)).toString('base64'), rowCount: rows.length };
    expect(await decodeFilterAggregation(compressed, [])).toEqual(data);
    const original = machineWith(compressed);
    const assets = new Map<string, string>();
    const machine = externalizeMachineAggregations(validateMachine(original), (hash, body) => assets.set(hash, body));
    const aggregate = machine.profiles[0].evFilters!.aggregation!;
    expect(aggregate.normalCostSchedule).toEqual(schedule);
    expect(validateMachine(machine)).toEqual(machine);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(assets.get(aggregate.rowsAsset!.sha256))));
    const decoded = await decodeFilterAggregation(aggregate, []);
    expect(decoded).toEqual(data);
    expect(aggregateFilterTable(decoded, [], {}, 630, 10)).toEqual(aggregateFilterTable(data, [], {}, 630, 10));
  });
});
