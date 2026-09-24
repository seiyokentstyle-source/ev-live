import { describe, expect, test } from "vitest";
import type { Machine, SettingAimUnit } from "../lib/ev/types";
import { buildHeatmapFromSettingAim } from "../lib/heatmap/setting-aim";
import type { HeatmapData, HeatmapGroupKey } from "../lib/heatmap/types";
import { averageNet, summarizeUnits, validateHeatmapData } from "../lib/heatmap/values";

type AimMachine = Pick<Machine, "id" | "available" | "settingAim">;
type FixtureUnit = SettingAimUnit & {
  dayDigitNets?: Partial<Record<Exclude<HeatmapGroupKey, "all">, { net: number; days: number }>>;
};

function unit(overrides: Partial<FixtureUnit> = {}): FixtureUnit {
  return { unit: "650", avg: 100, days: 1, rates: [100], net: 0, dayDigitNets: { "1": { net: 0, days: 1 } }, ...overrides };
}

function machine(id = "first", dates = ["2026-09-11"], units = [unit()]): AimMachine {
  return { id, available: true, settingAim: { label: "設定狙い", unit: "%", note: "", dates, units } };
}

function group(data: HeatmapData, key: HeatmapGroupKey) {
  return data.groups.find((value) => value.key === key)!;
}

describe("heatmap uses the setting-aim population", () => {
  test("merges different dates at the same seat and weights every machine-day equally", () => {
    const first = machine("before", ["2026-09-11", "2026-09-12"], [unit({
      days: 2, rates: [105, 110], net: 600,
      dayDigitNets: { "1": { net: 600, days: 2 }, "2": { net: 400, days: 1 } },
    })]);
    const second = machine("after", ["2026-09-21"], [unit({
      net: -300, rates: [95],
      dayDigitNets: { "1": { net: -300, days: 1 }, "2": { net: -300, days: 1 } },
    })]);
    const data = buildHeatmapFromSettingAim([first, second]);

    expect(group(data, "all").units).toEqual([{ unit: "650", days: 3, net: 300 }]);
    expect(averageNet(group(data, "all").units[0])).toBe(100);
    expect(group(data, "1").units).toEqual([{ unit: "650", days: 3, net: 300 }]);
    expect(group(data, "2").units).toEqual([{ unit: "650", days: 2, net: 100 }]);
    expect(group(data, "2")).toMatchObject({ firstDate: "2026-09-12", lastDate: "2026-09-21" });
    expect(data).toMatchObject({ dataFrom: "2026-09-11", dataTo: "2026-09-21" });
    expect(validateHeatmapData(data)).toBe(data);
  });

  test("weights seats by observed days rather than taking an average of seat averages", () => {
    const data = buildHeatmapFromSettingAim([machine("first", ["2026-09-11", "2026-09-12"], [
      unit({ days: 2, rates: [100, 110], net: 600, dayDigitNets: { "1": { net: 600, days: 2 }, "2": { net: 600, days: 1 } } }),
      unit({ unit: "651", days: 1, rates: [90, null], net: -300, dayDigitNets: { "1": { net: -300, days: 1 } } }),
    ])]);
    expect(summarizeUnits(group(data, "all").units)).toEqual({ days: 3, net: 300, average: 100 });
  });

  test("excludes null rates while retaining a measured zero-net day", () => {
    const data = buildHeatmapFromSettingAim([machine("first", ["2026-09-01", "2026-09-09", "2026-09-11"], [
      unit({ rates: [null, 100, null], net: 0, dayDigitNets: { "9": { net: 0, days: 1 } } }),
    ])]);
    expect(group(data, "all").units).toEqual([{ unit: "650", days: 1, net: 0 }]);
    expect(averageNet(group(data, "9").units[0])).toBe(0);
    expect(group(data, "1").units).toEqual([]);
    expect(data).toMatchObject({ dataFrom: "2026-09-09", dataTo: "2026-09-09" });
  });

  test("counts 11 once for digit 1 and does not count the leading zero in 09", () => {
    const data = buildHeatmapFromSettingAim([machine("first", ["2026-09-09", "2026-09-11"], [unit({
      days: 2, rates: [100, 105], net: 100,
      dayDigitNets: { "9": { net: 0, days: 1 }, "1": { net: 100, days: 1 } },
    })])]);
    expect(group(data, "1").units).toEqual([{ unit: "650", days: 1, net: 100 }]);
    expect(group(data, "9").units).toEqual([{ unit: "650", days: 1, net: 0 }]);
    expect(group(data, "0")).toMatchObject({ units: [], firstDate: null, lastDate: null });
  });

  test("legacy units without dayDigitNets contribute only to all dates", () => {
    const legacy = unit({ net: 600, rates: [123.4] });
    delete legacy.dayDigitNets;
    const data = buildHeatmapFromSettingAim([machine("legacy", ["2026-09-11"], [legacy])]);
    expect(group(data, "all").units).toEqual([{ unit: "650", days: 1, net: 600 }]);
    expect(data.groups.filter((value) => value.key !== "all").every((value) => value.units.length === 0)).toBe(true);
  });

  test("does not fill special-day values from another machine's legacy total at the same seat", () => {
    const legacy = unit({ net: 900, dayDigitNets: undefined });
    const current = unit({ net: -100, dayDigitNets: { "1": { net: -100, days: 1 }, "2": { net: -100, days: 1 } } });
    const data = buildHeatmapFromSettingAim([
      machine("legacy", ["2026-09-11"], [legacy]),
      machine("current", ["2026-09-21"], [current]),
    ]);
    expect(group(data, "all").units).toEqual([{ unit: "650", days: 2, net: 800 }]);
    expect(group(data, "1").units).toEqual([{ unit: "650", days: 1, net: -100 }]);
    expect(group(data, "1")).toMatchObject({ firstDate: "2026-09-21", lastDate: "2026-09-21" });
  });

  test("ignores unavailable machines and machines without settingAim", () => {
    const unavailable = { ...machine("hidden", ["bad-date"], [unit({ days: 100 })]), available: false };
    const data = buildHeatmapFromSettingAim([unavailable, { id: "pending", available: true }, machine()]);
    expect(group(data, "all").units).toEqual([{ unit: "650", days: 1, net: 0 }]);
  });

  test("returns an empty valid heatmap when no eligible data exists", () => {
    const data = buildHeatmapFromSettingAim([]);
    expect(data).toMatchObject({ dataFrom: null, dataTo: null });
    expect(data.groups).toHaveLength(11);
    expect(data.groups.every((value) => !value.units.length && value.firstDate === null && value.lastDate === null)).toBe(true);
    expect(validateHeatmapData(data)).toBe(data);
  });

  test("rejects identical same-seat same-date entries across machines instead of double counting", () => {
    expect(() => buildHeatmapFromSettingAim([machine("first"), machine("second")])).toThrow();
  });

  test("rejects duplicate same-seat rows within a machine", () => {
    expect(() => buildHeatmapFromSettingAim([machine("first", ["2026-09-11"], [unit(), unit()])])).toThrow();
  });

  test("rejects duplicate date columns", () => {
    expect(() => buildHeatmapFromSettingAim([machine("first", ["2026-09-11", "2026-09-11"], [
      unit({ days: 2, rates: [100, 100], dayDigitNets: { "1": { net: 0, days: 2 } } }),
    ])])).toThrow();
  });

  test.each(["2026-02-30", "2026-13-01", "2026-9-11", "invalid"])("rejects invalid date %s", (date) => {
    expect(() => buildHeatmapFromSettingAim([machine("first", [date])])).toThrow();
  });

  test("rejects an invalid date even when its reading is missing", () => {
    expect(() => buildHeatmapFromSettingAim([machine("first", ["2026-02-30", "2026-09-11"], [
      unit({ rates: [null, 100] }),
    ])])).toThrow();
  });

  test.each([
    ["total days disagree with valid rates", { days: 2 }],
    ["empty map omits a valid digit", { dayDigitNets: {} }],
    ["a map digit has no observed date", { dayDigitNets: { "1": { net: 0, days: 1 }, "9": { net: 0, days: 1 } } }],
    ["specific-day count disagrees with rates", { dayDigitNets: { "1": { net: 0, days: 2 } } }],
    ["specific-day count is zero", { dayDigitNets: { "1": { net: 0, days: 0 } } }],
    ["specific-day count is fractional", { dayDigitNets: { "1": { net: 0, days: 0.5 } } }],
    ["specific-day net is fractional", { dayDigitNets: { "1": { net: 0.5, days: 1 } } }],
    ["specific-day net is nonfinite", { dayDigitNets: { "1": { net: Infinity, days: 1 } } }],
    ["specific-day key is invalid", { dayDigitNets: { "x": { net: 0, days: 1 } } }],
  ])("rejects inconsistent data: %s", (_label, overrides) => {
    expect(() => buildHeatmapFromSettingAim([machine("first", ["2026-09-11"], [unit(overrides as Partial<FixtureUnit>)])])).toThrow();
  });
});

describe("bounded setting-aim snapshot fallback", () => {
  function snapshot() {
    return machine("first", ["2026-09-11"], [unit({
      net: 100, rates: [101], games: [1000], dayDigitNets: { "1": { net: 100, days: 1 } },
    })]);
  }

  test("does not restore snapshot seats after the current unit list becomes empty", () => {
    const current = machine("first", ["2026-09-11"], []);
    const data = buildHeatmapFromSettingAim([current], [snapshot()]);
    expect(data).toMatchObject({ dataFrom: null, dataTo: null });
    expect(data.groups.every((value) => value.units.length === 0)).toBe(true);
  });

  test("does not restore snapshot readings when the current seat has only null rates", () => {
    const current = machine("first", ["2026-09-11"], [unit({
      days: 0, net: 0, rates: [null], games: [0], dayDigitNets: undefined,
    })]);
    const data = buildHeatmapFromSettingAim([current], [snapshot()]);
    expect(data).toMatchObject({ dataFrom: null, dataTo: null });
    expect(data.groups.every((value) => value.units.length === 0)).toBe(true);
  });

  test("keeps current all-date totals while using only unchanged snapshot observations for specific days", () => {
    const current = machine("first", ["2026-09-11", "2026-09-21"], [unit({
      days: 2, net: 900, rates: [101, 110], games: [1000, 2000], dayDigitNets: undefined,
    })]);
    const data = buildHeatmapFromSettingAim([current], [snapshot()]);
    expect(group(data, "all").units).toEqual([{ unit: "650", days: 2, net: 900 }]);
    expect(data).toMatchObject({ dataFrom: "2026-09-11", dataTo: "2026-09-21" });
    expect(data.snapshotFallbackTo).toBe("2026-09-11");
    expect(group(data, "1")).toMatchObject({
      firstDate: "2026-09-11", lastDate: "2026-09-11", units: [{ unit: "650", days: 1, net: 100 }],
    });
    expect(group(data, "2").units).toEqual([]);
    expect(validateHeatmapData(data)).toBe(data);
  });

  test("prefers an explicit current map over an older snapshot", () => {
    const current = machine("first", ["2026-09-11", "2026-09-21"], [unit({
      days: 2, net: 900, rates: [101, 110], games: [1000, 2000],
      dayDigitNets: { "1": { net: 900, days: 2 }, "2": { net: 800, days: 1 } },
    })]);
    const data = buildHeatmapFromSettingAim([current], [snapshot()]);
    expect(group(data, "1").units).toEqual([{ unit: "650", days: 2, net: 900 }]);
    expect(group(data, "2").units).toEqual([{ unit: "650", days: 1, net: 800 }]);
    expect(group(data, "1").lastDate).toBe("2026-09-21");
    expect(data.snapshotFallbackTo).toBeUndefined();
  });

  test("declines fallback when the observation set is unchanged but its total net was corrected", () => {
    const current = machine("first", ["2026-09-11"], [unit({
      net: 120, rates: [101], games: [1000], dayDigitNets: undefined,
    })]);
    const data = buildHeatmapFromSettingAim([current], [snapshot()]);
    expect(group(data, "all").units).toEqual([{ unit: "650", days: 1, net: 120 }]);
    expect(group(data, "1").units).toEqual([]);
    expect(data.snapshotFallbackTo).toBeUndefined();
  });

  test.each([
    ["a snapshot date was removed", ["2026-09-12"], [101], [1000]],
    ["a snapshot rate changed", ["2026-09-11"], [101.1], [1000]],
    ["snapshot games changed", ["2026-09-11"], [101], [1001]],
    ["snapshot games are now absent", ["2026-09-11"], [101], undefined],
  ])("declines fallback when %s", (_reason, dates, rates, games) => {
    const current = machine("first", dates as string[], [unit({
      net: 500, rates: rates as number[], games: games as number[] | undefined, dayDigitNets: undefined,
    })]);
    const data = buildHeatmapFromSettingAim([current], [snapshot()]);
    expect(group(data, "all").units).toEqual([{ unit: "650", days: 1, net: 500 }]);
    expect(data.groups.filter((value) => value.key !== "all").every((value) => value.units.length === 0)).toBe(true);
  });

  test.each([
    ["different machine", "other", "650"],
    ["different seat", "first", "651"],
  ])("does not borrow a snapshot from a %s", (_reason, id, seat) => {
    const current = machine(id, ["2026-09-11"], [unit({
      unit: seat, net: 500, rates: [101], games: [1000], dayDigitNets: undefined,
    })]);
    const data = buildHeatmapFromSettingAim([current], [snapshot()]);
    expect(group(data, "all").units).toEqual([{ unit: seat, days: 1, net: 500 }]);
    expect(group(data, "1").units).toEqual([]);
  });

  test("matches by date instead of array position and ignores formerly missing readings", () => {
    const previous = machine("first", ["2026-09-09", "2026-09-11", "2026-09-12"], [unit({
      days: 1, net: 100, rates: [null, 101, null], games: [0, 1000, 0],
      dayDigitNets: { "1": { net: 100, days: 1 } },
    })]);
    const current = machine("first", ["2026-09-11", "2026-09-12"], [unit({
      days: 2, net: 900, rates: [101, 110], games: [1000, 2000], dayDigitNets: undefined,
    })]);
    const data = buildHeatmapFromSettingAim([current], [previous]);
    expect(group(data, "all").units).toEqual([{ unit: "650", days: 2, net: 900 }]);
    expect(group(data, "1").units).toEqual([{ unit: "650", days: 1, net: 100 }]);
    expect(group(data, "2").units).toEqual([]);
    expect(group(data, "9").units).toEqual([]);
  });

  test("does not use the fallback to hide an invalid explicit current map", () => {
    const current = machine("first", ["2026-09-11"], [unit({
      rates: [101], games: [1000], dayDigitNets: {},
    })]);
    expect(() => buildHeatmapFromSettingAim([current], [snapshot()])).toThrow();
  });

  test("declines fallback when both versions omit the games needed for verification", () => {
    const current = machine("first", ["2026-09-11"], [unit({ net: 500, rates: [101], dayDigitNets: undefined })]);
    const previous = machine("first", ["2026-09-11"], [unit({
      net: 100, rates: [101], dayDigitNets: { "1": { net: 100, days: 1 } },
    })]);
    const data = buildHeatmapFromSettingAim([current], [previous]);
    expect(group(data, "all").units).toEqual([{ unit: "650", days: 1, net: 500 }]);
    expect(group(data, "1").units).toEqual([]);
  });

  test.each([
    ["missing digit aggregate", { dayDigitNets: {} }],
    ["inconsistent observed days", { days: 2 }],
    ["invalid games", { games: [-1] }],
  ])("ignores an invalid fallback with %s and retains current totals", (_reason, overrides) => {
    const current = machine("first", ["2026-09-11"], [unit({
      net: 500, rates: [101], games: [1000], dayDigitNets: undefined,
    })]);
    const previous = snapshot();
    Object.assign(previous.settingAim!.units[0], overrides);
    const data = buildHeatmapFromSettingAim([current], [previous]);
    expect(group(data, "all").units).toEqual([{ unit: "650", days: 1, net: 500 }]);
    expect(group(data, "1").units).toEqual([]);
  });

  test("merges nonoverlapping machine placements but still rejects duplicate current seat-days", () => {
    const first = machine("first", ["2026-09-11"], [unit({
      net: 100, rates: [101], games: [1000], dayDigitNets: undefined,
    })]);
    const second = machine("second", ["2026-09-21"], [unit({
      net: -200, rates: [95], games: [500], dayDigitNets: undefined,
    })]);
    const secondSnapshot = machine("second", ["2026-09-21"], [unit({
      net: -200, rates: [95], games: [500],
      dayDigitNets: { "1": { net: -200, days: 1 }, "2": { net: -200, days: 1 } },
    })]);
    const data = buildHeatmapFromSettingAim([first, second], [snapshot(), secondSnapshot]);
    expect(group(data, "all").units).toEqual([{ unit: "650", days: 2, net: -100 }]);
    expect(group(data, "1").units).toEqual([{ unit: "650", days: 2, net: -100 }]);
    expect(() => buildHeatmapFromSettingAim([first, { ...first, id: "second" }], [snapshot()])).toThrow();
  });
});
