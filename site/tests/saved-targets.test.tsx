import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseMachineSavedTargets, parseSavedTargetCatalog, selectSavedTargets, type PublishedTarget } from '../lib/saved-targets.mjs';
import { SavedTargets } from '../components/ev/SavedTargets';
import { validateMachine } from '../lib/ev/validate';
import fixture from '../app/preview/ev-table/machine.json';
// @ts-expect-error build script is a standalone Node module
import { exportSavedTargets } from '../scripts/export-saved-targets.mjs';

const target = (): PublishedTarget => ({
  id: '7de93a9e-0830-4995-a6dc-8e8bfb451460', name: '任意の狙い目', machineId: 'test', hallId: 'shinjuku',
  conditionKey: 'a'.repeat(64), publicationKey: 'b'.repeat(64),
  definition: { schema: 'interval-target/v1', machineId: 'test', hallId: 'shinjuku', profileKey: 'cz', startG: 100, endG: 201,
    filters: { g: { mode: 'range', lo: '-1000', hi: '-100' }, cz: { mode: 'range', lo: '1', hi: '3' }, m: { mode: 'range', lo: '', hi: '' }, y: { mode: 'missing', lo: '', hi: '' } }, rate: '46/52', stopRule: 'evlive' },
  machine: '試験機種', profile: 'CZ間', conditions: '差枚−1,000〜−100枚未満 × 1〜2スルー', stopping: '当選後はEVLIVE条件で終了します。', rate: '46/52',
  sourceRevision: 'c'.repeat(64), dataThrough: '2026-09-03', updatedAt: '2026-09-10T01:00:00.000Z',
  rows: [{ g: 100, ev: 1234, n: 60, days: 8 }, { g: 200, ev: null, n: 0, days: 0 }],
});
const catalog = (targets = [target()]) => ({ schema: 'evlive-saved-targets/v1', updatedAt: '2026-09-10T01:00:00.000Z', targets });
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

describe('published target contract', () => {
  it('preserves negative bounds, exclusive upper bounds, missing and recorded-only filters', () => {
    expect(parseSavedTargetCatalog(catalog()).targets[0].definition.filters).toEqual(target().definition.filters);
  });
  it('publishes only allowlisted fields, including nested rows and definitions', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'evlive-targets-')); roots.push(root);
    const source = path.join(root, 'source.json'), output = path.join(root, 'public/saved-targets.json');
    const value = target();
    await fs.writeFile(source, JSON.stringify({ ...catalog([{ ...value, paths: ['private raw row'], definition: { ...value.definition, secret: 'private definition' }, rows: value.rows.map(row => ({ ...row, events: ['private event'] })) } as PublishedTarget]), privateKey: 'private key' }));
    await exportSavedTargets(source, output);
    const published = await fs.readFile(output, 'utf8');
    expect(published).not.toContain('private');
    expect(published).not.toContain('events');
    expect(JSON.parse(published).targets[0].publicationKey).toBe(value.publicationKey);
    await fs.writeFile(source, JSON.stringify(catalog([]))); await exportSavedTargets(source, output);
    expect(JSON.parse(await fs.readFile(output, 'utf8')).targets).toEqual([]);
  });
  it('rejects malformed aggregates and values at or beyond the stopping G', () => {
    expect(() => parseSavedTargetCatalog(catalog([{ ...target(), rows: [{ g: 201, ev: 1, n: 10, days: 1 }] }]))).toThrow();
    expect(() => parseSavedTargetCatalog(catalog([{ ...target(), rows: [{ g: 100, ev: 1, n: 0, days: 0 }] }]))).toThrow();
    expect(() => parseSavedTargetCatalog(catalog([{ ...target(), rows: [{ g: 100, ev: null, n: 1, days: 2 }] }]))).toThrow();
    expect(() => parseSavedTargetCatalog(catalog([target(), target()]))).toThrow();
  });
  it('strips nonaggregate fields from collector refreshes', () => {
    const value = target();
    expect(parseMachineSavedTargets([{ ...value, paths: ['private'] }])[0]).toEqual({ id: value.id, conditionKey: value.conditionKey, sourceRevision: value.sourceRevision, dataThrough: value.dataThrough, rows: value.rows });
  });
  it('does not serialize unpublished collector entries in public Machine props', () => {
    const machine = validateMachine({ ...fixture, savedTargets: [target()], intervalExplorer: { ciphertext: 'private feed' } });
    expect(machine).not.toHaveProperty('savedTargets');
    expect(machine).not.toHaveProperty('intervalExplorer');
  });
});

describe('published membership and refreshed values', () => {
  const refreshed = () => ({ id: target().id, conditionKey: target().conditionKey, sourceRevision: 'd'.repeat(64), dataThrough: '2026-09-04', rows: [{ g: 100, ev: 2222, n: 80, days: 9 }] });
  it('uses matching later aggregates but keeps the manually selected name', () => {
    const result = selectSavedTargets(parseSavedTargetCatalog(catalog()), 'test', 'shinjuku', [refreshed()])[0];
    expect(result).toMatchObject({ name: target().name, dataThrough: '2026-09-04', refreshed: true });
    expect(result.rows[0].ev).toBe(2222);
  });
  it('never lets stale collector entries reattach a removed target or cross machine/hall boundaries', () => {
    expect(selectSavedTargets(parseSavedTargetCatalog(catalog([])), 'test', 'shinjuku', [refreshed()])).toEqual([]);
    expect(selectSavedTargets(parseSavedTargetCatalog(catalog()), 'other', 'shinjuku', [refreshed()])).toEqual([]);
    expect(selectSavedTargets(parseSavedTargetCatalog(catalog()), 'test', 'akihabara', [refreshed()])).toEqual([]);
  });
  it.each([
    { conditionKey: 'e'.repeat(64) }, { dataThrough: '2026-09-02' }, { rows: [{ g: 300, ev: 123, n: 1, days: 1 }] },
  ])('keeps the dated manual snapshot if refresh does not apply: %j', patch => {
    const result = selectSavedTargets(parseSavedTargetCatalog(catalog()), 'test', 'shinjuku', [{ ...refreshed(), ...patch }])[0];
    expect(result.refreshed).toBe(false); expect(result.rows).toEqual(target().rows);
  });
  it('uses an empty refreshed cohort instead of resurrecting a nonempty old table', () => {
    const result = selectSavedTargets(parseSavedTargetCatalog(catalog()), 'test', 'shinjuku', [{ ...refreshed(), rows: [] }])[0];
    expect(result.rows).toEqual([]); expect(result.refreshed).toBe(true);
  });
});

it('renders only aggregate columns, escaped names, snapshot date, missing values and assumed payout notice', () => {
  const value = { ...target(), name: '<img src=x>', assumedPayout: true };
  const targets = selectSavedTargets(parseSavedTargetCatalog(catalog([value])), 'test', 'shinjuku');
  const html = renderToStaticMarkup(createElement(SavedTargets, { targets, selectedId: value.id, onSelect: () => {} }));
  expect(html).toContain('推定平均収支'); expect(html).toContain('件数'); expect(html).toContain('2026-09-03');
  expect(html).toContain('追加時の集計'); expect(html).toContain('設定1の想定値'); expect(html).toContain('—');
  expect(html).not.toContain('<img'); expect(html).not.toContain('機械割'); expect(html).not.toContain('時給');
});
