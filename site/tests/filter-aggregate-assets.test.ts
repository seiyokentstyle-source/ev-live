import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fixture from '../app/preview/ev-table/machine.json';
import { validateMachine } from '../lib/ev/validate';
import { externalizeMachineAggregations } from '../lib/filter-aggregate-assets.mjs';
import { buildLiveMachine } from '../lib/live-data';
import { declaredFilterAxes, groupProfiles } from '../lib/ev/profiles';
// @ts-expect-error build script intentionally uses the Node ESM runtime
import { exportFilterAggregates } from '../scripts/export-filter-aggregates.mjs';

const temporaryRoots: string[] = [];
afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    if (!root.startsWith(path.join(os.tmpdir(), 'evlive-aggregates-'))) throw new Error('Unexpected test directory');
    await fs.rm(root, { recursive: true, force: true });
  }
});

function machineWithRows(compressed = false) {
  const machine = validateMachine(structuredClone(fixture));
  const rows = [[1, 0, 3, 90, 300], [10, 0, 2, 50, 240]];
  machine.profiles[0].evFilters = {
    axes: [{ key: 'h', label: '前回', allLabel: '不問', options: [{ value: '0', label: '0〜' }] }],
    tables: {}, aggregation: {
      schema: 'evlive-filter-aggregates/v1', axisKeys: ['h'], axisMatchModes: ['single'],
      costPerGame: 30, exchange: 20, medalsPerGame: 1.5, junzou: 4, bet: 3,
      investmentMinimum: 'mean', roundingEpsilon: 1e-8,
      ...(compressed ? { rowsGzip: gzipSync(JSON.stringify(rows)).toString('base64'), rowCount: rows.length } : { rows })
    }
  };
  return machine;
}

describe('content-addressed aggregate publication', () => {
  it.each([false, true])('publishes matching split CZ assets and live profiles (gzip=%s)', async compressed => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'evlive-aggregates-'));
    temporaryRoots.push(root);
    const source = path.join(root, 'source'), output = path.join(root, 'output');
    await fs.mkdir(source);
    const machine = machineWithRows(compressed);
    machine.id = 'vvv2';
    const profile = machine.profiles[0];
    profile.key = 'cz_ceiling_4652';
    profile.label = 'CZ間天井（回数不問）・46/52';
    profile.aimKind = 'cz';
    profile.gRange = { start: 0, end: 80, step: 10 };
    profile.baseAnchors = [
      { g: 0, ev: 0, rtp: 100, n: 3, playG: 100 },
      { g: 80, ev: 0, rtp: 100, n: 4, playG: 100 }
    ];
    const rows = [
      [0, 1, 2, 200, 300], [0, 2, 1, 100, 150],
      [10, 1, 2, 180, 300], [10, 2, 1, 90, 150],
      [72, 0, 3, 900, 500], [72, 1, 1, 100, 200], [72, 2, 1, 80, 100],
      [80, 0, 2, 580, 400], [80, 1, 1, 92, 200], [80, 2, 1, 72, 100]
    ];
    profile.evFilters = {
      axes: [{ key: 'cz', label: 'CZスルー回数', allLabel: '不問',
        options: [0, 1, 2].map(value => ({ value: String(value), label: `${value}回` })) }],
      tables: {}, aggregation: {
        schema: 'evlive-filter-aggregates/v1', axisKeys: ['cz'],
        costPerGame: 30, exchange: 20, medalsPerGame: 1.5, junzou: 4, bet: 3,
        investmentMinimum: 'total', roundingEpsilon: 1e-8,
        ...(compressed ? { rowsGzip: gzipSync(JSON.stringify(rows)).toString('base64'), rowCount: rows.length } : { rows })
      }
    };
    machine.profiles = [profile];
    const original = JSON.stringify(machine);
    await fs.writeFile(path.join(source, 'vvv2.json'), original);
    const live = buildLiveMachine(machine, 'shinjuku', {
      schema: 'evlive-saved-targets/v1', updatedAt: '2026-09-22T00:00:00.000Z', targets: []
    });
    expect(live.machine.profiles.map(p => p.key)).toEqual(['cz_ceiling_zero_4652', 'cz_ceiling_after_4652']);
    expect(live.machine.profiles.map(p => p.gRange.start)).toEqual([72, 0]);
    expect(live.machine.profiles.map(p => p.baseAnchors[0].n)).toEqual([3, 3]);
    expect(groupProfiles(live.machine.profiles, 'vvv2').groups.map(group => group.label))
      .toEqual(['CZ間（0スルー）', 'CZ間（1スルー以降）']);
    expect(declaredFilterAxes(live.machine.profiles[1])?.find(axis => axis.key === 'cz')?.allLabel)
      .toBe('1スルー以降すべて');
    expect(JSON.stringify(live)).not.toContain('rowsGzip');
    expect(validateMachine(live.machine)).toEqual(live.machine);
    await exportFilterAggregates(source, output);
    for (const split of live.machine.profiles) {
      const asset = split.evFilters!.aggregation!.rowsAsset!;
      const body = await fs.readFile(path.join(output, `${asset.sha256}.json`), 'utf8');
      expect(createHash('sha256').update(body).digest('hex')).toBe(asset.sha256);
    }
    expect(JSON.stringify(machine)).toBe(original);
    expect(await fs.readFile(path.join(source, 'vvv2.json'), 'utf8')).toBe(original);
  });

  it.each([false, true])('externalizes rows and nested corrections without changing inputs (gzip=%s)', compressed => {
    const machine = machineWithRows(compressed);
    machine.setting1Correction = { schemaVersion: 1, sourceHallId: 'shinjuku', targetRtp: 0.97,
      payoutScale: 0.9, method: 'payout-scale', profiles: structuredClone(machine.profiles) };
    const original = structuredClone(machine);
    const assets = new Map<string, string>();
    const result = externalizeMachineAggregations(machine, (hash, body) => assets.set(hash, body));
    expect(machine).toEqual(original);
    expect(assets.size).toBe(1);
    const aggregate = result.profiles[0].evFilters!.aggregation!;
    expect(aggregate.rowsAsset?.rowCount).toBe(2);
    expect(aggregate).not.toHaveProperty('rows');
    expect(aggregate).not.toHaveProperty('rowsGzip');
    expect(result.setting1Correction!.profiles[0].evFilters!.aggregation).toEqual(aggregate);
    const body = assets.get(aggregate.rowsAsset!.sha256)!;
    expect(createHash('sha256').update(body).digest('hex')).toBe(aggregate.rowsAsset!.sha256);
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(compressed ? ['rowCount', 'rowsGzip'] : ['rows']);
    expect(externalizeMachineAggregations(result)).toEqual(result);
    expect(aggregate.exchange).toBe(20);
    expect(aggregate.axisMatchModes).toEqual(['single']);
  });

  it('updates live revisions when only row values or exchange constants change', () => {
    const machine = machineWithRows();
    const catalog = { schema: 'evlive-saved-targets/v1' as const, updatedAt: '2026-09-20T00:00:00.000Z', targets: [] };
    const initial = buildLiveMachine(machine, 'shinjuku', catalog);
    const alteredRows = structuredClone(machine);
    alteredRows.profiles[0].evFilters!.aggregation!.rows![0][4] += 1;
    const next = buildLiveMachine(alteredRows, 'shinjuku', catalog);
    expect(next.revision).not.toBe(initial.revision);
    expect(next.machine.profiles[0].evFilters!.aggregation!.rowsAsset).not.toEqual(
      initial.machine.profiles[0].evFilters!.aggregation!.rowsAsset);
    const alteredRate = structuredClone(machine);
    alteredRate.profiles[0].evFilters!.aggregation!.exchange = 1000 / 52;
    const rate = buildLiveMachine(alteredRate, 'shinjuku', catalog);
    expect(rate.revision).not.toBe(initial.revision);
    expect(rate.machine.profiles[0].evFilters!.aggregation!.rowsAsset).toEqual(
      initial.machine.profiles[0].evFilters!.aggregation!.rowsAsset);
    expect(JSON.stringify(initial)).not.toContain('rowsGzip');
    expect(validateMachine(initial.machine)).toEqual(initial.machine);
  });

  it('writes exact shared hashes across halls, updates rows and removes obsolete generated assets', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'evlive-aggregates-'));
    temporaryRoots.push(root);
    const source = path.join(root, 'source'), output = path.join(root, 'output');
    await fs.mkdir(path.join(source, 'mixed'), { recursive: true });
    const machine = machineWithRows(true);
    const sourceFile = path.join(source, `${machine.id}.json`);
    const mixedFile = path.join(source, 'mixed', `${machine.id}.json`);
    await fs.writeFile(sourceFile, JSON.stringify(machine));
    await fs.writeFile(mixedFile, JSON.stringify(machine));
    const before = await fs.readFile(sourceFile, 'utf8');
    expect((await exportFilterAggregates(source, output)).assets).toBe(1);
    const first = await fs.readdir(output);
    const body = await fs.readFile(path.join(output, first[0]), 'utf8');
    expect(first[0]).toBe(`${createHash('sha256').update(body).digest('hex')}.json`);
    const changed = machineWithRows();
    changed.profiles[0].evFilters!.aggregation!.rows![0][4] += 1;
    await fs.writeFile(mixedFile, JSON.stringify(changed));
    expect((await exportFilterAggregates(source, output)).assets).toBe(2);
    await fs.writeFile(mixedFile, JSON.stringify(machine));
    await fs.writeFile(path.join(output, 'keep.txt'), 'unrelated');
    expect((await exportFilterAggregates(source, output)).assets).toBe(1);
    expect((await fs.readdir(output)).sort()).toEqual([...first, 'keep.txt'].sort());
    expect(await fs.readFile(sourceFile, 'utf8')).toBe(before);
    await expect(exportFilterAggregates(source, source)).rejects.toThrow('separate');
    await expect(exportFilterAggregates(source, path.join(source, 'nested'))).rejects.toThrow('separate');
    await fs.writeFile(sourceFile, JSON.stringify(externalizeMachineAggregations(machine)));
    await expect(exportFilterAggregates(source, output)).rejects.toThrow('Source aggregates must contain');
  });
});
