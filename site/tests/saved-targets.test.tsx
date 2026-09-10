import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseMachineSavedTargets, parseSavedTargetCatalog, selectSavedTargets, type PublishedTarget, type TargetFilter } from '../lib/saved-targets.mjs';
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
const catalogWithFilters = (filters: Record<string, unknown>) => {
  const value = target();
  return catalog([{ ...value, definition: { ...value.definition, filters: filters as Record<string, TargetFilter> } }]);
};
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

describe('historical signal condition contract', () => {
  const categoryKeys = ['prev_first_raw_type', 'prev_second_raw_type', 'prev_third_raw_type', 'prev_last_raw_type', 'prev_raw_signature'];
  const numberKeys = ['next_ordinal', 'recorded_next_ordinal', 'prev_first_main_payout', 'prev_main_count', 'daily_single_count', 'daily_intermediate_failures', 'previous_same_first_type_run', 'sessions_since_single'];
  const range = (lo = '0', hi = '3') => ({ mode: 'range', lo, hi });
  const category = (value = 'BB') => ({ mode: 'category', lo: '', hi: '', value });
  const modulo = (period = 2, remainder = 1) => ({ mode: 'modulo', lo: '', hi: '', period, remainder });

  it('keeps the exact normalized definition and hash identities when all 13 historical fields are published', () => {
    const filters = Object.fromEntries([
      ...categoryKeys.map(key => [key, category(key === 'prev_raw_signature' ? 'BB → RB → BB' : 'BB')]),
      ...numberKeys.map(key => [key, range('0', key === 'prev_first_main_payout' ? '70.5' : '3')]),
    ].sort(([a], [b]) => String(a).localeCompare(String(b))));
    const value = catalogWithFilters(filters), parsed = parseSavedTargetCatalog(value).targets[0];
    expect(JSON.stringify(parsed.definition)).toBe(JSON.stringify(value.targets[0].definition));
    expect(parsed.conditionKey).toBe(value.targets[0].conditionKey);
    expect(parsed.publicationKey).toBe(value.targets[0].publicationKey);
  });
  it.each(categoryKeys)('preserves category values without trimming for %s', key => {
    const value = category(' BB ');
    expect(parseSavedTargetCatalog(catalogWithFilters({ [key]: value })).targets[0].definition.filters[key]).toEqual(value);
  });
  it('accepts each supported period and phase only on historical ordinal fields', () => {
    for (const key of ['next_ordinal', 'recorded_next_ordinal']) {
      for (let period = 2; period <= 6; period++) {
        for (let remainder = 0; remainder < period; remainder++) {
          const value = modulo(period, remainder);
          expect(parseSavedTargetCatalog(catalogWithFilters({ [key]: value })).targets[0].definition.filters[key]).toEqual(value);
        }
      }
    }
  });
  it('keeps missing, recorded-only ranges and omitted filtering distinct', () => {
    const filters = { prev_first_raw_type: { mode: 'missing', lo: '', hi: '' }, daily_single_count: range('', ''), next_ordinal: { mode: 'all', lo: '', hi: '' } };
    expect(parseSavedTargetCatalog(catalogWithFilters(filters)).targets[0].definition.filters).toEqual(filters);
  });
  it.each(['first_main_payout', 'first_raw_type', 'last_raw_type', 'raw_signature', 'main_count', 'total_payout', 'hit_g', 'unknown'])('rejects future or unknown field %s', key => {
    expect(() => parseSavedTargetCatalog(catalogWithFilters({ [key]: range() }))).toThrow();
  });
  it.each([
    ['prev_main_count', category()], ['prev_first_raw_type', range()], ['prev_raw_signature', modulo()],
    ['daily_single_count', modulo()], ['prev_first_main_payout', modulo()], ['g', modulo()], ['y', category()],
    ['next_ordinal', modulo(1)], ['next_ordinal', modulo(7)], ['next_ordinal', modulo(2.5)],
    ['next_ordinal', modulo(2, -1)], ['next_ordinal', modulo(2, 2)], ['next_ordinal', modulo(2, 0.5)],
    ['next_ordinal', { ...modulo(), period: '2' }], ['next_ordinal', { ...modulo(), lo: '0' }],
    ['prev_first_raw_type', category('')], ['prev_first_raw_type', category(' ')],
    ['prev_first_raw_type', category('B'.repeat(201))], ['prev_first_raw_type', category('BB\nRB')],
    ['prev_first_raw_type', category('BB\u007f')], ['prev_first_raw_type', category('BB\u0085')],
    ['prev_first_raw_type', { ...category(), hi: '1' }],
    ['daily_single_count', range('-1', '3')], ['daily_single_count', range('1.5', '3')],
    ['daily_single_count', range('0', '100000001')], ['daily_single_count', range('3', '3')],
    ['daily_single_count', range('4', '3')], ['daily_single_count', range('NaN', '3')],
    ['prev_first_main_payout', range('-0.1', '70')], ['prev_first_main_payout', range('0', 'Infinity')],
    ['prev_first_main_payout', { mode: 'missing', lo: '1', hi: '' }],
  ])('rejects invalid historical filter %s: %j', (key, value) => {
    expect(() => parseSavedTargetCatalog(catalogWithFilters({ [String(key)]: value }))).toThrow();
  });
  it('accepts finite nonnegative payout bounds and the maximum count while stripping extra fields', () => {
    const filters = { prev_first_main_payout: range('0.5', '70.5'), prev_main_count: range('0', '100000000'), next_ordinal: { ...modulo(), events: ['private'] }, prev_first_raw_type: { ...category('B'.repeat(200)), events: ['private'] } };
    const parsed = parseSavedTargetCatalog(catalogWithFilters(filters));
    expect(parsed.targets[0].definition.filters.prev_first_main_payout).toEqual(range('0.5', '70.5'));
    expect(JSON.stringify(parsed)).not.toContain('private');
    expect(parsed.targets[0].definition.filters.next_ordinal).toEqual(modulo());
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
