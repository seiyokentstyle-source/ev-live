import { describe, expect, it } from "vitest";
import { compareMachines, sampleCount } from "../lib/machine-order";
import type { Machine } from "../lib/ev/types";

/** 並び順だけを見るので、順序に関わるフィールドだけ本物にした最小の機種を作る。
 *  スクレイプ値には依存させない。 */
function machine(id: string, samples: string, releaseDate: string): Machine {
  return {
    id,
    name: id,
    manufacturer: "X",
    aliases: [],
    thumb: null,
    available: true,
    releaseDate,
    lastUpdated: "2026-01-01",
    meta: { samples, source: "synthetic" },
    profiles: [],
    axes: [],
    modifiers: {},
    creditValue: {},
    economics: { medalsPerGame: 2, gamesPerHour: 800 }
  } as unknown as Machine;
}

describe("sampleCount", () => {
  it("桁区切りの入った表示用文字列を数値へ戻す", () => {
    expect(sampleCount(machine("a", "4,807", "2026-01-01"))).toBe(4807);
    expect(sampleCount(machine("b", "22", "2026-01-01"))).toBe(22);
  });

  it("読めない値は0として最後尾へ送る", () => {
    expect(sampleCount(machine("c", "", "2026-01-01"))).toBe(0);
    expect(sampleCount(machine("d", "-", "2026-01-01"))).toBe(0);
  });

  it("一覧の全店舗合計を優先し、0も店舗別件数で置き換えない", () => {
    expect(sampleCount({ ...machine("a", "123", "2026-01-01"), totalSamples: 579 })).toBe(579);
    expect(sampleCount({ ...machine("b", "999", "2026-01-01"), totalSamples: 0 })).toBe(0);
  });
});

describe("compareMachines", () => {
  it("全店舗合計の多い順に並べ、店舗別の数は変えない", () => {
    const combined = { ...machine("combined", "100", "2026-01-01"), totalSamples: 600 };
    const single = { ...machine("single", "500", "2026-01-01"), totalSamples: 500 };
    expect([single, combined].sort(compareMachines).map(item => item.id)).toEqual(["combined", "single"]);
    expect(combined.meta.samples).toBe("100");
  });

  it("サンプルの多い順に並ぶ", () => {
    const sorted = [
      machine("few", "22", "2026-06-08"),
      machine("many", "4,807", "2023-01-01"),
      machine("mid", "948", "2025-01-01")
    ].sort(compareMachines);
    expect(sorted.map((m) => m.id)).toEqual(["many", "mid", "few"]);
  });

  it("導入日が新しくてもサンプルが少なければ下に来る", () => {
    // 導入日未登録の機種が既定値のまま同着になっていた問題を、順序が拾わないこと。
    const newButThin = machine("new", "30", "2026-06-08");
    const oldButThick = machine("old", "2,584", "2024-01-01");
    expect(compareMachines(newButThin, oldButThick)).toBeGreaterThan(0);
  });

  it("サンプルが同数なら導入日の新しい順", () => {
    const sorted = [
      machine("older", "100", "2024-01-01"),
      machine("newer", "100", "2026-01-01")
    ].sort(compareMachines);
    expect(sorted.map((m) => m.id)).toEqual(["newer", "older"]);
  });

  it("サンプルも導入日も同じなら id で固定してビルドごとに揺れない", () => {
    const sorted = [
      machine("b", "100", "2024-01-01"),
      machine("a", "100", "2024-01-01")
    ].sort(compareMachines);
    expect(sorted.map((m) => m.id)).toEqual(["a", "b"]);
    expect(compareMachines(machine("a", "100", "2024-01-01"), machine("a", "100", "2024-01-01"))).toBe(0);
  });
});
