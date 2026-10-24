import { describe, expect, it } from 'vitest';
import fixture from '../app/preview/ev-table/machine.json';
import { normalizeMachineMetadata } from '../lib/machine-metadata';
import { withoutLowSetting } from '../lib/ev/low-setting';
import { validateMachine } from '../lib/ev/validate';
import type { Machine } from '../lib/ev/types';

const detail = '台データの種別（BB/RB/ART等）と実機のボーナス・AT・CZの対応、連チャンの区切りを実データで確かめるまで、期待値の算出を保留しています。';
const legacy = '台データオンライン（エスパス日拓新宿歌舞伎町店）だけにある機種で、履歴は取り込み始めたところです。' + detail;
const current = '履歴は保存済みです。' + detail;

type EvidenceMachine = Machine & { sourceIntegrity: { schemaVersion: number; hallId: string;
  machineName: string; targetDate: string; inputSha256: string } };

function pending(): EvidenceMachine {
  const machine = validateMachine(structuredClone(fixture));
  return {
    ...machine, id: 'mbef0d24f', name: 'Lモグモグ風林火山 大海戦の巻',
    sourceIntegrity: { schemaVersion: 1, hallId: 'ueno_shinkan', machineName: 'Lモグモグ風林火山 大海戦の巻',
      targetDate: '2026-10-22', inputSha256: 'a'.repeat(64) },
    profiles: [{ ...machine.profiles[0], key: 'counter_pending', dataPending: true,
      pendingReason: legacy, baseAnchors: [], sessions: 0 }],
    calcSpec: { items: [{ k: '期待値の算出状況', v: legacy }, { k: 'データカウンター', v: legacy }] },
  };
}

describe('legacy counter-pending display wording', () => {
  it('changes only the three exact text fields, retaining the pending reason detail and all evidence', () => {
    const input = pending(), before = structuredClone(input);
    const actual = normalizeMachineMetadata(input);
    const expected = structuredClone(input);
    expected.profiles[0].pendingReason = current;
    expected.calcSpec!.items.forEach(item => { item.v = current; });
    expect(actual).toEqual(expected);
    expect(input).toEqual(before);
    expect((actual as EvidenceMachine).sourceIntegrity).toBe(input.sourceIntegrity);
    expect(actual.profiles[0].baseAnchors).toBe(input.profiles[0].baseAnchors);
    expect(normalizeMachineMetadata(actual)).toBe(actual);
    expect(() => validateMachine(structuredClone(actual))).not.toThrow();
  });

  it.each([
    { key: 'other', dataPending: true, pendingReason: legacy },
    { key: 'counter_pending', dataPending: false, pendingReason: legacy },
    { key: 'counter_pending', dataPending: undefined, pendingReason: legacy },
    { key: 'counter_pending', dataPending: true, pendingReason: legacy + '追加確認中。' },
    { key: 'counter_pending', dataPending: true, pendingReason: current },
  ])('leaves unmatched pending profiles and their specification text intact: %j', profile => {
    const input = pending();
    input.profiles[0] = { ...input.profiles[0], ...profile };
    expect(normalizeMachineMetadata(input)).toBe(input);
  });

  it('does not rewrite other profile types, keys, or partially matching text', () => {
    const input = pending();
    input.profiles.push({ ...input.profiles[0], key: 'other' });
    input.calcSpec!.items.push({ k: '別の注記', v: legacy }, { k: '期待値の算出状況', v: legacy + '追記' });
    const actual = normalizeMachineMetadata(input);
    expect(actual.profiles[1]).toBe(input.profiles[1]);
    expect(actual.calcSpec!.items.slice(2)).toEqual(input.calcSpec!.items.slice(2));
  });

  it('keeps the numerical filter result equivalent apart from the same three text fields', () => {
    const input = pending();
    const before = withoutLowSetting(input), after = withoutLowSetting(normalizeMachineMetadata(input));
    expect(before).not.toBeNull();
    expect(after).toEqual(normalizeMachineMetadata(before!));
    expect(after!.profiles[0]).toMatchObject({ dataPending: true, baseAnchors: [], sessions: 0 });
    input.calcSpec!.items.push({ k: '獲得は実測ではない', v: '既存の除外理由' });
    expect(withoutLowSetting(input)).toBeNull();
    expect(withoutLowSetting(normalizeMachineMetadata(input))).toBeNull();
  });
});
