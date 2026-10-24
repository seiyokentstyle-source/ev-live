import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../app/preview/ev-table/machine.json';
import { normalizeMachineMetadata } from '../lib/machine-metadata';
import { onlyLowSetting, withoutLowSetting } from '../lib/ev/low-setting';
import { validateMachine } from '../lib/ev/validate';
import { MachineDetailClient } from '../app/machines/[id]/MachineDetailClient';
import { getHall } from '../lib/halls';
import type { Machine } from '../lib/ev/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const published = '機械割97.6%／設定1機械割97.6%（公表値: slobase / chonborista）。';
const legacy = published + 'サイトセブンのBB（AT）獲得が約45%欠けるため、この機械割と実測の初当りG分布から1回あたりの獲得を逆算している';
type EvidenceMachine = Machine & { sourceIntegrity: { schemaVersion: number; hallId: string;
  machineName: string; targetDate: string; inputSha256: string } };

function mixed(): EvidenceMachine {
  const machine = validateMachine(structuredClone(fixture));
  return {
    ...machine, id: 'm407111cd', name: 'L魔法少女にあこがれて',
    sourceIntegrity: { schemaVersion: 1, hallId: 'mixed', machineName: 'L魔法少女にあこがれて',
      targetDate: '2026-10-22', inputSha256: 'a'.repeat(64) },
    mixedSources: { schemaVersion: 1, halls: ['kabuki', 'akiba_espace', 'seibu_shinjuku',
      'ueno_honkan', 'ueno_shinkan', 'espace_shibuya_shinkan'], inputSha256: 'a'.repeat(64) },
    setting1Correction: { schemaVersion: 1, sourceHallId: 'mixed', targetRtp: 0.976,
      payoutScale: 1.1282622404692777, method: 'payout-scale', profiles: structuredClone(machine.profiles) },
    calcSpec: { items: [{ k: '設定1（公表）', v: legacy }, { k: '別の注記', v: legacy }] },
  };
}

describe('mixed-source display wording', () => {
  it('changes only the exact obsolete Maho explanation, preserving public RTP, sources and all evidence', () => {
    const input = mixed(), before = structuredClone(input);
    const expected = structuredClone(input);
    expected.calcSpec!.items[0].v = published;
    const actual = normalizeMachineMetadata(input);
    expect(actual).toEqual(expected);
    expect(input).toEqual(before);
    for (const key of ['profiles', 'setting1Correction', 'sourceIntegrity', 'mixedSources'] as const)
      expect((actual as EvidenceMachine)[key]).toBe(input[key]);
    expect(normalizeMachineMetadata(actual)).toBe(actual);
    expect(() => validateMachine(structuredClone(actual))).not.toThrow();
  });

  it.each<[string, (machine: EvidenceMachine) => void]>([
    ['other ID', machine => { machine.id = 'other'; }],
    ['other name', machine => { machine.name += 'II'; }],
    ['single-store correction', machine => { machine.setting1Correction!.sourceHallId = 'shinjuku'; }],
    ['assumed payout', machine => { machine.setting1Correction!.method = 'assumed-payout'; }],
    ['different public RTP', machine => { machine.setting1Correction!.targetRtp = 0.98; }],
    ['no correction', machine => { delete machine.setting1Correction; }],
    ['no combined provenance', machine => { delete machine.mixedSources; }],
    ['empty source list', machine => { machine.mixedSources!.halls = []; }],
    ['SiteSeven source', machine => { machine.mixedSources!.halls.push('shinjuku'); }],
    ['Island source', machine => { machine.mixedSources!.halls.push('akihabara'); }],
    ['unreviewed source', machine => { machine.mixedSources!.halls.push('new_hall'); }],
    ['additional explanation', machine => { machine.calcSpec!.items[0].v += '追記'; }],
    ['other item key', machine => { machine.calcSpec!.items[0].k = '他の条件'; }],
  ])('preserves the original explanation for %s', (_case, mutate) => {
    const input = mixed();
    mutate(input);
    expect(normalizeMachineMetadata(input)).toBe(input);
  });

  it('keeps both normal filters and all corrected profiles numerically identical', () => {
    const input = mixed(), normalized = normalizeMachineMetadata(input);
    const before = onlyLowSetting(input)!, after = onlyLowSetting(normalized)!;
    const expected = structuredClone(before);
    expected.calcSpec!.items.find(item => item.k === '設定1（公表）')!.v = published;
    expect(after).toEqual(expected);
    expect(after.profiles).toBe(input.setting1Correction!.profiles);
    const rawExpected = structuredClone(withoutLowSetting(input)!);
    rawExpected.calcSpec!.items.find(item => item.k === '設定1（公表）')!.v = published;
    expect(withoutLowSetting(normalized)).toEqual(rawExpected);
  });

  it('renders the corrected mixed table with a source-neutral caption and the retained published citation', () => {
    const machine = onlyLowSetting(normalizeMachineMetadata(mixed()))!;
    const html = renderToStaticMarkup(<MachineDetailClient machine={machine} hall={getHall('mixed')!} />);
    expect(html).toContain('当選G・条件別母数は収集対象店舗の実測');
    expect(html).not.toContain('当選G・条件別母数は新宿の実測');
    expect(machine.calcSpec!.items.find(item => item.k === '設定1（公表）')!.v).toBe(published);
    // The unrelated item intentionally retains its original text.
    expect(machine.calcSpec!.items.find(item => item.k === '別の注記')!.v).toBe(legacy);
  });
});
