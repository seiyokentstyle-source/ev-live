import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import fixture from '../app/preview/ev-table/machine.json';
import { splitCzThroughProfiles } from '../lib/cz-through-profiles.mjs';
import { aggregateFilterTable } from '../lib/ev/filter-aggregation';
import { validateMachine } from '../lib/ev/validate';
import { groupProfiles, selectedFilterTable } from '../lib/ev/profiles';
import type { DecodedFilterAggregation, FilterAxis, Machine, Profile } from '../lib/ev/types';

const axes: FilterAxis[] = [
  { key: 'd', label: '特定日', allLabel: '不問', options: ['1', '3'].map(value => ({ value, label: value })) },
  { key: 'cz', label: 'CZスルー回数', allLabel: '不問', options: ['0', '1', '2'].map(value => ({ value, label: `${value}回` })) },
  { key: 'prev_cz', label: '前回CZ', allLabel: '不問', options: ['0', '1'].map(value => ({ value, label: value })) }
];
const rows = [
  [0, 3, 1, 0, 2, 200, 600], [0, 1, 2, 1, 1, 100, 150],
  [70, 3, 1, 0, 2, 60, 600], [70, 1, 2, 1, 1, 30, 150],
  [72, 3, 0, 0, 4, 1200, 900], [72, 3, 1, 0, 2, 56, 600], [72, 1, 2, 1, 1, 28, 150],
  [80, 3, 0, 0, 4, 1168, 900], [80, 3, 1, 0, 2, 40, 600],
  [1000, 3, 0, 0, 1, 100, 900], [1000, 3, 1, 0, 1, 100, 900]
];

function makeProfile(rate = '4652', compressed = true, scale = 1): Profile {
  return {
    key: `cz_ceiling_${rate}`, aimKind: 'cz', label: `CZ間（回数不問）・${rate === '4652' ? '46/52' : '50/50'}`,
    ceiling: 'CZ間999G', gRange: { start: 0, end: 990, step: 10 }, activeAxes: [],
    baseAnchors: [{ g: 0, n: 3, ev: 100, rtp: 101 }], zones: [{ g: 10, label: 'old' }, { g: 80, label: 'zone' }],
    sessions: 8, totalPayout: 10000, firstHitRate: 200, sampleNote: 'old unrestricted note',
    evFilters: { axes: structuredClone(axes), tables: {}, aggregation: {
      schema: 'evlive-filter-aggregates/v1', axisKeys: axes.map(axis => axis.key), axisMatchModes: ['bitmask', 'single', 'single'],
      costPerGame: rate === '4652' ? 1.53 * 1000 / 46 : 30.6, exchange: rate === '4652' ? 1000 / 52 : 20,
      medalsPerGame: 1.53, junzou: 9, bet: 3, investmentMinimum: 'total', roundingEpsilon: 1e-8,
      ...(compressed ? { rowsGzip: gzipSync(JSON.stringify(rows.map(row => row.map((n, i) => i === 6 ? n * scale : n)))).toString('base64'), rowCount: rows.length }
        : { rows: rows.map(row => row.map((n, i) => i === 6 ? n * scale : n)) })
    } }
  };
}

function makeMachine(compressed = true): Machine {
  return { ...validateMachine(structuredClone(fixture)), id: 'vvv2',
    profiles: [makeProfile('4652', compressed), makeProfile('5050', compressed)],
    setting1Correction: { schemaVersion: 1, sourceHallId: 'shinjuku', targetRtp: .97,
      payoutScale: .8, method: 'payout-scale', profiles: [makeProfile('4652', compressed, .8), makeProfile('5050', compressed, .8)] }
  };
}

function decoded(profile: Profile): DecodedFilterAggregation {
  const data = profile.evFilters!.aggregation!;
  const { rowsGzip: encoded, rowCount: _count, rowsAsset: _asset, ...parameters } = data;
  return { ...parameters, rows: data.rows ?? JSON.parse(gunzipSync(Buffer.from(encoded!, 'base64')).toString()) };
}

describe('VVV2 normal CZ cohort publication', () => {
  it.each([false, true])('splits both rates and corrected data with unchanged inputs (gzip=%s)', compressed => {
    const machine = makeMachine(compressed), original = structuredClone(machine);
    const result = splitCzThroughProfiles(machine);
    expect(machine).toEqual(original);
    expect(result.profiles.map(profile => profile.key)).toEqual([
      'cz_ceiling_zero_4652', 'cz_ceiling_after_4652', 'cz_ceiling_zero_5050', 'cz_ceiling_after_5050'
    ]);
    expect(result.setting1Correction!.profiles.map(profile => profile.key)).toEqual(result.profiles.map(profile => profile.key));
    expect(validateMachine(result)).toEqual(result);
    expect(splitCzThroughProfiles(result)).toEqual(result);
    const grouped = groupProfiles(result.profiles, 'vvv2');
    expect(grouped.groups.map(group => group.label)).toEqual(['CZ間（0スルー）', 'CZ間（1スルー以降）']);
    expect(grouped.rates.map(rate => rate.value)).toEqual(['4652', '5050']);
  });

  it('keeps the 72G entry and all later counts distinct from the 0G CZ-after group', () => {
    const machine = makeMachine(), result = splitCzThroughProfiles(machine);
    for (const profiles of [result.profiles, result.setting1Correction!.profiles]) {
      for (const zero of profiles.filter(profile => profile.key.includes('_zero_'))) {
        expect(zero.gRange.start).toBe(72);
        expect(zero.baseAnchors.map(anchor => anchor.g)).toEqual([72, 80]);
        expect(zero.baseAnchors[0].n).toBe(4);
        expect(zero.evFilters!.axes!.map(axis => axis.key)).toEqual(['d', 'prev_cz']);
        expect(decoded(zero).axisMatchModes).toEqual(['bitmask', 'single']);
        expect(zero.zones.map(zone => zone.g)).toEqual([80]);
      }
      for (const after of profiles.filter(profile => profile.key.includes('_after_'))) {
        expect(after.gRange.start).toBe(0);
        expect(after.baseAnchors.map(anchor => anchor.g)).toEqual([0, 70, 72, 80]);
        expect(after.baseAnchors.map(anchor => anchor.n)).toEqual([3, 3, 3, 2]);
        expect(after.evFilters!.axes![1].options.map(option => option.value)).toEqual(['1', '2']);
        expect(after.evFilters!.axes![1].allLabel).toBe('1スルー以降すべて');
        expect(decoded(after).axisMatchModes).toEqual(['bitmask', 'single', 'single']);
      }
      for (const profile of profiles) {
        expect(decoded(profile).rows.every(row => row[0] <= 990)).toBe(true);
        expect(profile).not.toHaveProperty('sessions');
        expect(profile).not.toHaveProperty('firstHitRate');
        expect(profile).not.toHaveProperty('totalPayout');
        expect(profile.sampleNote).toContain('各開始Gのサンプル数');
      }
    }
  });

  it('calculates both rates and payout corrections from the original sums', () => {
    const machine = makeMachine(), result = splitCzThroughProfiles(machine);
    for (const [source, split] of [[machine.profiles, result.profiles],
      [machine.setting1Correction!.profiles, result.setting1Correction!.profiles]]) {
      for (const original of source) {
        const rate = original.key.slice(-4), originalData = decoded(original);
        const zero = split.find(profile => profile.key === `cz_ceiling_zero_${rate}`)!;
        const after = split.find(profile => profile.key === `cz_ceiling_after_${rate}`)!;
        const originalAxes = original.evFilters!.axes!;
        const bounded = { ...originalData, rows: originalData.rows.filter(row => row[0] <= original.gRange.end) };
        expect(zero.baseAnchors).toEqual(aggregateFilterTable(bounded, originalAxes, { cz: '0' }, 0).baseAnchors);
        expect(after.baseAnchors).toEqual(aggregateFilterTable({ ...bounded, rows: bounded.rows.filter(row => row[2] >= 1) }, originalAxes, {}, 0).baseAnchors);
      }
    }
    expect(result.setting1Correction!.profiles[0].baseAnchors[0].ev).toBeLessThan(result.profiles[0].baseAnchors[0].ev);
    expect(result.setting1Correction!.profiles[0].baseAnchors[0].n).toBe(result.profiles[0].baseAnchors[0].n);
  });

  it('preserves exact 1/2-through intersections and overlapping day masks after remapping', () => {
    const machine = makeMachine(), result = splitCzThroughProfiles(machine);
    const original = machine.profiles[0], after = result.profiles[1], zero = result.profiles[0];
    for (const cz of ['1', '2']) for (const d of ['1', '3']) for (const prev_cz of ['0', '1']) {
      const selection = { cz, d, prev_cz };
      const expected = aggregateFilterTable({ ...decoded(original), rows: decoded(original).rows.filter(row => row[0] <= 990) }, original.evFilters!.axes!, selection, 0);
      const actual = selectedFilterTable(after, after.evFilters!.axes!, selection, decoded(after));
      expect(actual).toEqual(expected);
    }
    const originalZero = aggregateFilterTable({ ...decoded(original), rows: decoded(original).rows.filter(row => row[0] <= 990) }, axes, { cz: '0', d: '3' }, 72);
    expect(selectedFilterTable(zero, zero.evFilters!.axes!, { d: '3' }, decoded(zero))).toEqual(originalZero);
    expect(aggregateFilterTable(decoded(after), after.evFilters!.axes!, { cz: '0' }, 0).hits).toBe(0);
  });

  it('leaves reset, pullback, legacy estimates, non-VVV2, and exploration metadata unchanged', () => {
    const machine = makeMachine();
    const untouched = ['cz_reset_4652', 'comeback_4652', 'cz_s1_4652'].map(key => ({ ...makeProfile(), key }));
    machine.profiles.push(...untouched);
    const result = splitCzThroughProfiles(machine);
    for (const profile of untouched) expect(result.profiles.find(value => value.key === profile.key)).toBe(profile);
    expect(result.savedTargets).toBe(machine.savedTargets);
    const other = { ...machine, id: 'other' };
    expect(splitCzThroughProfiles(other)).toBe(other);
  });

  it('keeps legacy/unavailable/unknown-axis cohorts whole instead of dropping samples', () => {
    const legacy = makeMachine();
    delete legacy.profiles[0].evFilters;
    expect(splitCzThroughProfiles(legacy).profiles[0]).toBe(legacy.profiles[0]);
    const external = makeMachine();
    const { rowsGzip: _gzip, rowCount: _count, ...parameters } = external.profiles[0].evFilters!.aggregation!;
    external.profiles[0].evFilters!.aggregation = { ...parameters, rowsAsset: { sha256: 'a'.repeat(64), rowCount: rows.length } };
    expect(splitCzThroughProfiles(external).profiles[0]).toBe(external.profiles[0]);
    const unknown = makeMachine(false);
    unknown.profiles[0].evFilters!.aggregation!.rows![0][2] = -1;
    expect(splitCzThroughProfiles(unknown).profiles[0]).toBe(unknown.profiles[0]);
  });

  it('normalizes rounded zero EV to neutral RTP so published validation still succeeds', () => {
    const machine = makeMachine(false), data = machine.profiles[0].evFilters!.aggregation!;
    data.costPerGame = 1; data.exchange = 1;
    data.rows = [[72, 3, 0, 0, 1, 1.1, 1], [0, 3, 1, 0, 1, 1.1, 1]];
    const result = splitCzThroughProfiles(machine);
    expect(result.profiles[0].baseAnchors[0]).toMatchObject({ ev: 0, rtp: 100 });
    expect(validateMachine(result)).toEqual(result);
  });

  it.each(['gzip', 'count', 'duplicate', 'bitmask', 'parameter', 'czmode', 'conflict'])('rejects corrupt %s data instead of publishing a false split', defect => {
    const machine = makeMachine(defect === 'gzip' || defect === 'count'), data = machine.profiles[0].evFilters!.aggregation!;
    if (defect === 'gzip') data.rowsGzip = 'abcd';
    if (defect === 'count') data.rowCount = 1;
    if (defect === 'duplicate') data.rows!.push([...data.rows![0]]);
    if (defect === 'bitmask') data.rows![0][1] = 4;
    if (defect === 'parameter') data.exchange = NaN;
    if (defect === 'czmode') data.axisMatchModes![1] = 'bitmask';
    if (defect === 'conflict') (data as unknown as { rowsGzip: string }).rowsGzip = 'abcd';
    expect(() => splitCzThroughProfiles(machine)).toThrow(/aggregation|CZ/);
  });
});
