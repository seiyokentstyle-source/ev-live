import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EvTable } from '../components/ev/EvTable';
import { SavedTargets, savedTargetTableRows } from '../components/ev/SavedTargets';
import type { Machine, Profile } from '../lib/ev/types';
import type { DisplayTarget, TargetRow } from '../lib/saved-targets.mjs';

const machine: Machine = {
  id: 'sample', name: '試験機種', manufacturer: 'X', aliases: [], thumb: null,
  available: true, releaseDate: '2025-01-01', lastUpdated: '2026-09-09',
  meta: { samples: '20', source: 'synthetic' }, profiles: [], axes: [],
  modifiers: {}, creditValue: { '46': 1000 / 46, '50': 20 },
  economics: { medalsPerGame: 1.5, gamesPerHour: 800 },
  evCalc: { bet: 3, use: 1.5, junzou: 5, ceiling: 1000, step: 10 },
};
const target = (rows: TargetRow[] = [{ g: 0, ev: 240, n: 20, days: 3, inv: 200, playG: 400 }]): DisplayTarget => ({
  id: '47ce26c5-dea4-4008-a89b-56d02a233674', name: '条件付きの狙い目',
  machineId: machine.id, hallId: 'shinjuku', conditionKey: 'a'.repeat(64), publicationKey: 'b'.repeat(64),
  sourceRevision: 'c'.repeat(64), dataThrough: '2026-09-09', updatedAt: '2026-09-16T00:00:00Z',
  machine: machine.name, profile: 'AT間', conditions: '前回の獲得500枚以上', stopping: '当選後終了',
  rate: '46/52', refreshed: true,
  definition: { schema: 'interval-target/v1', machineId: machine.id, hallId: 'shinjuku', profileKey: 'at',
    startG: 0, endG: null, filters: {}, rate: '46/52', stopRule: 'evlive' }, rows,
});
const render = (value: DisplayTarget) => renderToStaticMarkup(
  <SavedTargets machine={machine} targets={[value]} selectedId={value.id} onSelect={() => {}} />
);
const table = (html: string) => html.match(/<table\b[\s\S]*?<\/table>/)?.[0];

describe('the same table format for saved targets and EV play', () => {
  it.each(['46/52', '50/50'] as const)('shares the exact table markup and cash-profit metrics at %s', rate => {
    const value = target(); value.rate = rate; value.definition.rate = rate;
    const rows = savedTargetTableRows(value, machine, 10);
    expect(rows[0]).toMatchObject({ g: 0, ev: 240, rtp: 101, hourly: 480, medals: 200, n: 20 });
    const profile: Profile = { key: `normal_${rate === '46/52' ? '4652' : '5050'}`, label: '通常', ceiling: '1000G',
      gRange: { start: 0, end: 1000, step: 10 }, activeAxes: [], baseAnchors: [], zones: [] };
    const normal = renderToStaticMarkup(<EvTable machine={machine} profile={profile} rows={rows} onViewGChange={() => {}} />);
    const saved = render(value);
    expect(table(saved)).toBe(table(normal));
    expect(saved).toContain(rate === '46/52' ? '換算機械割' : '機械割');
    expect(saved).toContain('期待値'); expect(saved).toContain('時給');
    expect(saved).toContain('平均投入'); expect(saved).toContain('サンプル');
    expect(saved).toContain('101.0'); expect(saved).toContain('+480');
  });

  it('defaults to all collected 10G rows instead of hiding them behind a 100G interval', () => {
    const value = target([0, 10, 20, 30].map(g => ({ g, ev: 240, n: 20, days: 3, inv: 200, playG: 400 })));
    const html = render(value);
    expect(html).toMatch(/<option value="10" selected="">/);
    expect(table(html)?.match(/<tr>/g)).toHaveLength(5);
    expect(html).toContain('10G刻み / 4行');
  });

  it('keeps the specified nonround G and final row at wider intervals without inventing intermediate rows', () => {
    const value = target([72, 80, 90, 100, 110, 120, 130, 135].map(g => ({ g, ev: 240, n: 20, days: 3 })));
    value.definition.startG = 72;
    expect(savedTargetTableRows(value, machine, 100).map(row => row.g)).toEqual([72, 100, 135]);
    expect(savedTargetTableRows(value, machine, 10).map(row => row.g)).toEqual(value.rows.map(row => row.g));
  });

  it('preserves existing EV and sample counts when an old target has no duration or investment', () => {
    const value = target([{ g: 0, ev: 240, n: 7, days: 2 }]);
    expect(savedTargetTableRows(value, machine, 10)[0]).toMatchObject({ ev: 240, n: 7, rtp: null, hourly: null, medals: null, noData: false });
    const html = table(render(value))!;
    expect(html).toContain('+240'); expect(html.match(/—/g)).toHaveLength(3);
    expect(html).not.toContain('100.0'); expect(html).not.toContain('NaN');
  });

  it('keeps zero-sample rows empty and does not borrow values from the main profile', () => {
    const value = target([{ g: 0, ev: null, n: 0, days: 0, inv: null, playG: null }]);
    expect(savedTargetTableRows(value, machine, 10)[0]).toMatchObject({ ev: null, n: 0, rtp: null, hourly: null, medals: null, noData: true });
    expect(table(render(value))?.match(/—/g)).toHaveLength(4);
  });

  it('uses only this target cohort and the machine speed/bet, while preserving source values', () => {
    const value = target([{ g: 0, ev: -240, n: 20, days: 3, inv: 200.4, playG: 400 }]);
    const before = JSON.stringify(value);
    const alternate = { ...machine, evCalc: { ...machine.evCalc!, bet: 2 }, economics: { ...machine.economics, gamesPerHour: 600 } };
    expect(savedTargetTableRows(value, alternate, 10)[0]).toMatchObject({ ev: -240, rtp: 98.5, hourly: -360, medals: 200, n: 20 });
    expect(JSON.stringify(value)).toBe(before);
  });

  it('does not calculate a rate or hourly value for a zero duration', () => {
    const value = target([{ g: 0, ev: 0, n: 1, days: 1, inv: 0, playG: 0 }]);
    expect(savedTargetTableRows(value, machine, 10)[0]).toMatchObject({ ev: 0, rtp: null, hourly: null, medals: 0 });
  });

  it('keeps the empty-target state usable', () => {
    const html = renderToStaticMarkup(<SavedTargets machine={machine} targets={[]} selectedId="" onSelect={() => {}} />);
    expect(html).toContain('掲載中の狙い目はありません');
    expect(html).not.toContain('<table');
  });

  it('uses identical one-sample and empty results when selected from the normal aim bar', () => {
    const value = target([{ g: 0, ev: 240, n: 1, days: 1, inv: 200, playG: 400 }]);
    const embedded = renderToStaticMarkup(<SavedTargets machine={machine} targets={[value]} selectedId={value.id}
      showSelector={false} onSelect={() => {}} />);
    expect(table(embedded)).toBe(table(render(value)));
    expect(embedded).not.toContain('id="saved-target-choice"');
    expect(embedded).toContain('46枚貸し／52枚交換');
    const empty = { ...value, rows: [] };
    const emptyHtml = renderToStaticMarkup(<SavedTargets machine={machine} targets={[empty]} selectedId={empty.id}
      showSelector={false} onSelect={() => {}} />);
    expect(emptyHtml).toContain('この条件で集計できる区間はありません');
    expect(emptyHtml).not.toContain('<table');
  });
});
