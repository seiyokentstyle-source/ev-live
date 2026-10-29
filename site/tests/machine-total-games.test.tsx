import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { machineSummary, retainGames, retainSettingAimGames, settingAimGames } from "../lib/ev/summary";
import { selectMachineListSummaries } from "../lib/machine-list-summary";
import { formatGames, MachineCard } from "../components/machine-list/MachineCard";
import { collectedFixture } from "./fixtures/collection-status";

const aim = (games: Array<Array<number | null> | undefined>) => ({
  label: "", unit: "", note: "", dates: ["2026-10-01", "2026-10-02"],
  units: games.map((g, i) => ({ unit: String(i + 1), rates: [100, 100], net: 0, ...(g ? { games: g } : {}) })),
});

describe("home card total games", () => {
  it("sums the setting-aim games per unit and day", () => {
    expect(settingAimGames({ settingAim: aim([[8000, null], [5000, 3000], undefined]) as never })).toBe(16000);
    expect(settingAimGames({})).toBeUndefined();
    expect(settingAimGames({ settingAim: aim([[null, null]]) as never })).toBeUndefined();
  });

  it("keeps the hall total in the summary", () => {
    const base = collectedFixture("same").summary;
    expect(machineSummary({ ...base, settingAim: aim([[8000, 2000]]) } as never).games).toBe(10000);
    expect(machineSummary(base)).not.toHaveProperty("games");
  });

  it("keeps the games after the setting-aim table is removed for display", () => {
    const base = collectedFixture("same").summary;
    const original = { ...base, settingAim: aim([[8000, 2000]]) } as never as Record<string, unknown>;
    const { settingAim: _removed, ...stripped } = original;
    const first = retainSettingAimGames(stripped, original as never);
    // さらに加工した後の機種にも引き継がれる。
    const second = retainSettingAimGames({ ...first }, first as never);
    expect(machineSummary(first as never).games).toBe(10000);
    expect(machineSummary(second as never).games).toBe(10000);
    expect(machineSummary(retainGames({ ...base }, 1234) as never).games).toBe(1234);
  });

  it("uses the mixed source halls' games when the samples come from the mixed table", () => {
    const base = collectedFixture("same").summary;
    const entry = (hallId: string, samples: string, games?: number) =>
      ({ hallId, summary: { ...base, meta: { samples, source: "fixture" }, ...(games !== undefined ? { games } : {}) } });
    const [mixed] = selectMachineListSummaries([
      entry("shinjuku", "100", 2_000_000), entry("mixed-raw", "300", 5_000_000)]);
    expect(mixed).toMatchObject({ totalSamples: 300, totalGames: 5_000_000 });
    const [unknown] = selectMachineListSummaries([
      entry("shinjuku", "100", 2_000_000), entry("mixed-raw", "300")]);
    expect(unknown.totalGames).toBeUndefined();
  });

  it("adds each physical hall once and ignores mixed tables", () => {
    const base = collectedFixture("same").summary;
    const entry = (hallId: string, samples: string, games?: number) =>
      ({ hallId, summary: { ...base, meta: { samples, source: "fixture" }, ...(games !== undefined ? { games } : {}) } });
    const [selected] = selectMachineListSummaries([
      entry("shinjuku", "100", 2_000_000), entry("kabuki", "50", 1_000_000),
      entry("kabuki", "50", 1_000_000), entry("mixed", "150", 9_999_999),
    ]);
    expect(selected).toMatchObject({ totalSamples: 150, totalGames: 3_000_000 });
    const [none] = selectMachineListSummaries([entry("shinjuku", "100")]);
    expect(none.totalGames).toBeUndefined();
  });

  it("shows the rounded games next to the samples", () => {
    expect(formatGames(24_861_234)).toBe("2,486万");
    expect(formatGames(9_876)).toBe("9,876");
    const base = collectedFixture("same").summary;
    const machine = { ...base, meta: { samples: "62,166", source: "fixture" }, totalSamples: 62166, totalGames: 24_861_234 };
    const html = renderToString(createElement(MachineCard, { machine, isFavorite: false,
      match: { type: "none" }, onOpen: vi.fn(), onToggleFavorite: vi.fn() }));
    expect(html).toContain("62,166");
    expect(html).toContain("約<!-- -->2,486万<!-- -->G");
    expect(html).toContain("サンプル（AT突入回数）");
    // 件数とG数はそれぞれ途中で折り返さず、入りきらないときだけG数が下の行へ回る。
    expect(html).toMatch(/flex-wrap/);
    expect(html).toMatch(/whitespace-nowrap[^>]*>62,166/);
    expect(html).toMatch(/whitespace-nowrap[^>]*>約/);
    const without = renderToString(createElement(MachineCard, { machine: { ...machine, totalGames: undefined }, isFavorite: false,
      match: { type: "none" }, onOpen: vi.fn(), onToggleFavorite: vi.fn() }));
    expect(without).not.toContain("万G");
  });
});
