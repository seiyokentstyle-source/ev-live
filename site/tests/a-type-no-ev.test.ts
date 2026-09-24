import { describe, expect, it } from 'vitest';
import fixture from '../app/preview/ev-table/machine.json';
import { A_TYPE_NO_EV, A_TYPE_PENDING_REASON, normalizeMachineMetadata } from '../lib/machine-metadata';
import { validateMachine } from '../lib/ev/validate';
import type { Machine } from '../lib/ev/types';

const base = (): Machine => validateMachine(structuredClone(fixture));

describe('Aタイプは期待値表を出さない', () => {
  it.each(Object.entries(A_TYPE_NO_EV))('%s は表を算出保留に置き換え、設定狙いは残す', (id, name) => {
    const src: Machine = {
      ...base(), id, name,
      settingAim: { label: '設定狙い', unit: '%', note: '', dates: [], units: [] } as unknown as Machine['settingAim'],
      atPayout: { step: 50, label: 'x', note: 'x', bands: [] } as unknown as Machine['atPayout'],
    };
    const before = structuredClone(src);
    const out = normalizeMachineMetadata(src);
    expect(src).toEqual(before);
    expect(out.profiles).toHaveLength(1);
    expect(out.profiles[0]).toMatchObject({ dataPending: true, pendingReason: A_TYPE_PENDING_REASON, baseAnchors: [] });
    expect(out.atPayout).toBeUndefined();
    expect(out.theoretical).toBeUndefined();
    expect(out.setting1Correction).toBeUndefined();
    expect(out.settingAim).toEqual(src.settingAim);
    expect(() => validateMachine(structuredClone(out))).not.toThrow();
    // 2回かけても同じ（読み込み口が重なっても壊れない）。
    expect(normalizeMachineMetadata(out)).toEqual(out);
  });

  it('id が同じでも完全名が違えば触らない（シリーズ名の部分一致で広げない）', () => {
    const [id, name] = Object.entries(A_TYPE_NO_EV)[0];
    const src: Machine = { ...base(), id, name: `${name}2` };
    expect(normalizeMachineMetadata(src)).toBe(src);
  });
});
