import { describe, expect, it } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { buildLiveMachine } from "../lib/live-data";
import { validateMachine } from "../lib/ev/validate";
import { onlyLowSetting, withoutLowSetting } from "../lib/ev/low-setting";
import type { Machine } from "../lib/ev/types";
import type { KatanaEstimate } from "../lib/ev/katana-estimate";
import { katanaEstimateFixture, unavailableKatanaEstimateFixture } from "./fixtures/katana-estimate";

export function katanaMachine(estimate: KatanaEstimate = katanaEstimateFixture()): Machine {
  return validateMachine({ ...structuredClone(fixture), id: "mfc4a14a4", name: "いざ！番長", aliases: [],
    lastUpdated: estimate.source.periodEnd, katanaEstimate: estimate });
}
const catalog = { schema: "evlive-saved-targets/v1" as const, updatedAt: "2026-09-04T00:00:00Z", targets: [] };

describe("刀参考試算と公開snapshot", () => {
  it("同日・同件数でも刀の再計算だけで公開revisionが変わる", () => {
    const machine = katanaMachine();
    const first = buildLiveMachine(machine, "shinjuku", catalog);
    const changed = structuredClone(machine);
    if (!changed.katanaEstimate?.ready) throw new Error("ready fixture required");
    changed.katanaEstimate.rows[0].evYen = 54321;
    const next = buildLiveMachine(changed, "shinjuku", catalog);
    expect(next.revision).not.toBe(first.revision);
    expect(next.machine.katanaEstimate).toEqual(changed.katanaEstimate);
    expect(buildLiveMachine(machine, "shinjuku", catalog).revision).toBe(first.revision);
  });

  it("0件への更新を公開し、古い平均・行を残さない", () => {
    const first = buildLiveMachine(katanaMachine(), "shinjuku", catalog);
    const next = buildLiveMachine(katanaMachine(unavailableKatanaEstimateFixture()), "shinjuku", catalog);
    expect(next.revision).not.toBe(first.revision);
    expect(next.machine.katanaEstimate).toMatchObject({ ready: false, sample: { count: 0, meanPayout: null }, rows: [] });
  });

  it("別店舗の回収をその店舗の参考試算として公開しない", () => {
    expect(() => buildLiveMachine(katanaMachine(), "kabuki", catalog)).toThrow("another hall");
    expect(() => buildLiveMachine(katanaMachine(), "mixed", catalog)).toThrow("another hall");
  });

  it("機種JSONの対象末日を超える参考試算を拒否する", () => {
    const data = katanaMachine();
    data.lastUpdated = "2026-09-02";
    expect(() => validateMachine(data)).toThrow("source exceeds lastUpdated");
  });

  it("店舗別には保持し、設定1補正と旧式の低設定表示の双方から除く", () => {
    const machine = katanaMachine();
    const [profile] = machine.profiles;
    const input: Machine = { ...machine, profiles: [profile, { ...profile, key: "setting1", label: "設定1想定" }],
      setting1Correction: { ...machine.setting1Correction, method: "payout-scale", payoutScale: 0.8, targetRtp: 0.976,
        profiles: [{ ...profile, key: "corrected" }] } as Machine["setting1Correction"] };
    expect(withoutLowSetting(input)?.katanaEstimate).toEqual(machine.katanaEstimate);
    expect(onlyLowSetting(input)).not.toHaveProperty("katanaEstimate");
    delete input.setting1Correction;
    expect(onlyLowSetting(input)).not.toHaveProperty("katanaEstimate");
    input.calcSpec = { items: [{ k: "獲得は実測ではない", v: "理論値" }] };
    expect(onlyLowSetting(input)).not.toHaveProperty("katanaEstimate");
    expect(machine.katanaEstimate).toBeDefined();
  });
});
