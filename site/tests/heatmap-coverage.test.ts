import { describe, expect, test } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import type { HeatmapCoverage, HeatmapCoverageUnit, Machine } from "../lib/ev/types";
import { validateHeatmapCoverage } from "../lib/ev/heatmap-coverage";
import { validateMachine } from "../lib/ev/validate";
import { withHeatmapCoverage } from "../lib/heatmap/coverage";
import { buildHeatmapFromSettingAim } from "../lib/heatmap/setting-aim";
import { HEATMAP_GROUP_KEYS, type HeatmapData, type HeatmapGroupKey } from "../lib/heatmap/types";
import { summarizeUnits, validateHeatmapData } from "../lib/heatmap/values";

function coverage(dates = ["2026-09-11"], unit = "650", reason = "差枚を算出できないため集計待ち"): HeatmapCoverage {
  const groups = Object.fromEntries(HEATMAP_GROUP_KEYS.map((key) => [key, []])) as HeatmapCoverage["groups"];
  for (const key of HEATMAP_GROUP_KEYS) {
    const matching = dates.filter((date) => key === "all" || String(Number(date.slice(-2))).includes(key)).sort();
    if (matching.length) groups[key].push({ unit, days: matching.length, firstDate: matching[0], lastDate: matching[matching.length - 1] });
  }
  return { schema: "heatmap-coverage/v1", reason, groups };
}

function source(heatmapCoverage = coverage(), id = "pending") {
  return { id, heatmapCoverage };
}

function money(unit = "650", net = 0, withDigits = true): HeatmapData {
  return buildHeatmapFromSettingAim([{
    id: "measured", available: true,
    settingAim: {
      label: "設定狙い", unit: "%", note: "", dates: ["2026-09-11"],
      units: [{ unit, avg: 100, days: 1, rates: [100], net, ...(withDigits ? { dayDigitNets: { "1": { days: 1, net } } } : {}) }],
    },
  }]);
}

function group(data: HeatmapData, key: HeatmapGroupKey) {
  return data.groups.find((value) => value.key === key)!;
}

function monetaryOnly(data: HeatmapData): HeatmapData {
  return { ...data, groups: data.groups.map(({ pendingUnits: _pending, ...value }) => value) };
}

describe("heatmap coverage contract", () => {
  test("accepts date-specific presence counts with no monetary estimate", () => {
    const value = coverage(["2026-09-09", "2026-09-10", "2026-09-11", "2026-09-21"]);
    expect(validateHeatmapCoverage(value)).toEqual(value);
    expect(value.groups["0"]).toEqual([{ unit: "650", days: 1, firstDate: "2026-09-10", lastDate: "2026-09-10" }]);
    expect(value.groups["1"][0].days).toBe(3);
    expect(value.groups["9"][0].days).toBe(1);
    expect(value.groups["2"][0].days).toBe(1);
  });

  test("accepts explicitly empty coverage in all eleven groups", () => {
    const value = coverage([]);
    expect(validateHeatmapCoverage(value)).toEqual(value);
  });

  test("retains valid coverage at the public machine validation boundary", () => {
    const value = coverage();
    expect(validateMachine({ ...structuredClone(fixture), lastUpdated: "2026-09-11", heatmapCoverage: value }).heatmapCoverage).toEqual(value);
    expect(validateMachine(structuredClone(fixture)).heatmapCoverage).toBeUndefined();
  });

  test("rejects malformed coverage at the public machine validation boundary", () => {
    const value = coverage();
    value.groups.all[0].days = 0;
    expect(() => validateMachine({ ...structuredClone(fixture), lastUpdated: "2026-09-11", heatmapCoverage: value })).toThrow();
  });

  test("accepts the enclosing date itself but rejects observations beyond it", () => {
    const value = coverage();
    expect(validateHeatmapCoverage(value, "2026-09-11")).toEqual(value);
    expect(() => validateHeatmapCoverage(value, "2026-09-10")).toThrow();
    expect(() => validateMachine({ ...structuredClone(fixture), lastUpdated: "2026-09-10", heatmapCoverage: value })).toThrow();
  });

  test.each([null, undefined, [], 42, "coverage"])("rejects non-object input %j", (value) => {
    expect(() => validateHeatmapCoverage(value)).toThrow();
  });

  test.each([
    ["schema", "heatmap-coverage/v2"], ["reason", ""], ["reason", "   "], ["reason", null],
    ["groups", []], ["groups", null],
  ])("rejects invalid %s value %j", (key, value) => {
    expect(() => validateHeatmapCoverage({ ...coverage(), [key]: value })).toThrow();
  });

  test("requires every date group even when it has no observations", () => {
    const value = coverage();
    const { "0": _omitted, ...groups } = value.groups;
    expect(() => validateHeatmapCoverage({ ...value, groups })).toThrow();
  });

  test("rejects an unsupported date group", () => {
    const value = coverage();
    expect(() => validateHeatmapCoverage({ ...value, groups: { ...value.groups, "10": [] } })).toThrow();
  });

  test("requires an array for each group", () => {
    const value = coverage();
    expect(() => validateHeatmapCoverage({ ...value, groups: { ...value.groups, "0": {} } })).toThrow();
  });

  test.each(["0", "0650", "9007199254740992"])("rejects non-canonical or unsafe physical seat number %s", (unit) => {
    expect(() => validateHeatmapCoverage(coverage(["2026-09-11"], unit))).toThrow();
  });

  test.each(["net", "rawHistory"])("rejects unknown root field %s instead of exposing it in the heatmap", (key) => {
    const value = { ...coverage(), [key]: 12345 };
    expect(() => validateHeatmapCoverage(value)).toThrow();
    expect(() => withHeatmapCoverage(buildHeatmapFromSettingAim([]), [source(value)])).toThrow();
  });

  test.each(["net", "dailyNet"])("rejects unknown unit field %s before it reaches pending metadata", (key) => {
    const value = coverage();
    value.groups.all[0] = { ...value.groups.all[0], [key]: 12345 } as HeatmapCoverageUnit;
    expect(() => validateHeatmapCoverage(value)).toThrow();
    expect(() => withHeatmapCoverage(buildHeatmapFromSettingAim([]), [source(value)])).toThrow();
  });

  test.each([
    ["unit", ""], ["unit", "A650"], ["unit", 650],
    ["days", 0], ["days", -1], ["days", 1.5], ["days", Infinity], ["days", Number.MAX_SAFE_INTEGER + 1],
    ["firstDate", "2026-02-30"], ["lastDate", "2026-09-31"], ["firstDate", "2026-9-11"],
    ["firstDate", null], ["lastDate", "2026-09-10"],
  ])("rejects malformed unit %s = %j", (key, value) => {
    const input = coverage();
    input.groups.all[0] = { ...input.groups.all[0], [key]: value } as HeatmapCoverageUnit;
    expect(() => validateHeatmapCoverage(input)).toThrow();
  });

  test.each(["all", "1"] as const)("rejects duplicate unit rows within group %s", (key) => {
    const value = coverage();
    value.groups[key].push({ ...value.groups[key][0] });
    expect(() => validateHeatmapCoverage(value)).toThrow();
  });

  test("rejects more observed days than the calendar range can hold", () => {
    const value = coverage();
    value.groups.all[0].days = 2;
    expect(() => validateHeatmapCoverage(value)).toThrow();
  });

  test("requires a corresponding all-date unit for every specific-day unit", () => {
    const value = coverage();
    value.groups["1"][0].unit = "651";
    expect(() => validateHeatmapCoverage(value)).toThrow();
  });

  test("rejects a specific-day count larger than that unit's all-date count", () => {
    const value = coverage(["2026-09-11", "2026-09-21"]);
    value.groups["1"][0].days = 3;
    expect(() => validateHeatmapCoverage(value)).toThrow();
  });

  test("rejects a digit count larger than the matching calendar dates in its own range", () => {
    const value = coverage(["2026-09-09", "2026-09-10", "2026-09-19"]);
    value.groups["9"][0].days = 3;
    expect(() => validateHeatmapCoverage(value)).toThrow();
  });

  test.each(["firstDate", "lastDate"] as const)("keeps specific-day %s inside its all-date range", (key) => {
    const value = coverage(["2026-09-11", "2026-09-21"]);
    value.groups["1"][0][key] = key === "firstDate" ? "2026-09-01" : "2026-10-01";
    expect(() => validateHeatmapCoverage(value)).toThrow();
  });

  test("requires both specific-day endpoints to contain the selected digit", () => {
    const value = coverage(["2026-09-09", "2026-09-11"]);
    value.groups["9"][0].lastDate = "2026-09-10";
    expect(() => validateHeatmapCoverage(value)).toThrow();
  });

  test("does not treat a leading zero in the day as a zero-day observation", () => {
    const value = coverage(["2026-09-09"]);
    value.groups["0"] = [{ ...value.groups.all[0] }];
    expect(() => validateHeatmapCoverage(value)).toThrow();
  });
});

describe("heatmap pending coverage stays separate from monetary data", () => {
  test("returns the monetary content unchanged for legacy sources or empty coverage", () => {
    const data = money("650", -120);
    expect(withHeatmapCoverage(data, [])).toEqual(data);
    expect(monetaryOnly(withHeatmapCoverage(data, [source(coverage([]))]))).toEqual(data);
  });

  test("preserves measured units, net, counts, and date ranges without mutating input", () => {
    const data = money("650", 600);
    const before = structuredClone(data);
    const rawCoverage = coverage(["2026-08-11", "2026-10-11"], "651");
    const beforeCoverage = structuredClone(rawCoverage);
    const result = withHeatmapCoverage(data, [source(rawCoverage)]);
    expect(data).toEqual(before);
    expect(rawCoverage).toEqual(beforeCoverage);
    expect(monetaryOnly(result)).toEqual(before);
    expect(summarizeUnits(group(result, "all").units)).toEqual({ days: 1, net: 600, average: 600 });
    expect(group(result, "all").pendingUnits).toEqual([{
      unit: "651", days: 2, firstDate: "2026-08-11", lastDate: "2026-10-11", reasons: [rawCoverage.reason],
    }]);
    expect(validateHeatmapData(result)).toEqual(result);
  });

  test("shows presence even when no machine has a usable monetary result", () => {
    const result = withHeatmapCoverage(buildHeatmapFromSettingAim([]), [source()]);
    expect(result).toMatchObject({ dataFrom: null, dataTo: null });
    expect(group(result, "all")).toMatchObject({ firstDate: null, lastDate: null, units: [], pendingUnits: [{ unit: "650", days: 1 }] });
    expect(summarizeUnits(group(result, "all").units)).toEqual({ days: 0, net: 0, average: null });
    expect(validateHeatmapData(result)).toEqual(result);
  });

  test.each([0, 300, -300])("a measured result of %s takes precedence over pending presence", (net) => {
    const data = money("650", net);
    const result = withHeatmapCoverage(data, [source()]);
    expect(monetaryOnly(result)).toEqual(data);
    expect(group(result, "all").pendingUnits ?? []).toEqual([]);
    expect(group(result, "1").pendingUnits ?? []).toEqual([]);
    expect(group(result, "all").units[0].net).toBe(net);
  });

  test("evaluates monetary precedence separately for every date filter", () => {
    const data = money("650", 0, false);
    const result = withHeatmapCoverage(data, [source()]);
    expect(group(result, "all").pendingUnits ?? []).toEqual([]);
    expect(group(result, "1").units).toEqual([]);
    expect(group(result, "1").pendingUnits).toEqual([{
      unit: "650", days: 1, firstDate: "2026-09-11", lastDate: "2026-09-11", reasons: [coverage().reason],
    }]);
    expect(group(result, "2").pendingUnits ?? []).toEqual([]);
  });

  test("uses each digit's own presence count instead of copying all-date coverage", () => {
    const result = withHeatmapCoverage(buildHeatmapFromSettingAim([]), [source(coverage(["2026-09-09", "2026-09-10", "2026-09-11", "2026-09-21"]))]);
    expect(group(result, "all").pendingUnits?.[0].days).toBe(4);
    expect(group(result, "0").pendingUnits?.[0].days).toBe(1);
    expect(group(result, "1").pendingUnits?.[0].days).toBe(3);
    expect(group(result, "2").pendingUnits?.[0].days).toBe(1);
    expect(group(result, "9").pendingUnits?.[0].days).toBe(1);
    expect(group(result, "3").pendingUnits ?? []).toEqual([]);
  });

  test("merges disjoint historical machine ranges for the same physical seat", () => {
    const result = withHeatmapCoverage(buildHeatmapFromSettingAim([]), [
      source(coverage(["2026-09-11", "2026-09-12"], "650", "旧機種の差枚未算出"), "old"),
      source(coverage(["2026-09-21"], "650", "新機種の差枚未算出"), "new"),
    ]);
    expect(group(result, "all").pendingUnits).toEqual([{
      unit: "650", days: 3, firstDate: "2026-09-11", lastDate: "2026-09-21", reasons: ["旧機種の差枚未算出", "新機種の差枚未算出"],
    }]);
    expect(group(result, "2").pendingUnits).toEqual([{
      unit: "650", days: 2, firstDate: "2026-09-12", lastDate: "2026-09-21", reasons: ["旧機種の差枚未算出", "新機種の差枚未算出"],
    }]);
  });

  test("deduplicates repeated reasons without losing historical days", () => {
    const result = withHeatmapCoverage(buildHeatmapFromSettingAim([]), [
      source(coverage(["2026-09-11"]), "old"), source(coverage(["2026-09-21"]), "new"),
    ]);
    expect(group(result, "all").pendingUnits?.[0]).toMatchObject({ days: 2, reasons: [coverage().reason] });
  });

  test("does not sum possibly overlapping histories and retains their individual periods", () => {
    const result = withHeatmapCoverage(buildHeatmapFromSettingAim([]), [
      source(coverage(["2026-09-11", "2026-09-21"], "650", "旧機種の差枚未算出"), "old"),
      source(coverage(["2026-09-15", "2026-09-25"], "650", "新機種の差枚未算出"), "new"),
    ]);
    expect(group(result, "all").pendingUnits).toEqual([{
      unit: "650", days: null, firstDate: "2026-09-11", lastDate: "2026-09-25", reasons: ["旧機種の差枚未算出", "新機種の差枚未算出"],
      overlappingPeriods: [
        { days: 2, firstDate: "2026-09-11", lastDate: "2026-09-21", reason: "旧機種の差枚未算出" },
        { days: 2, firstDate: "2026-09-15", lastDate: "2026-09-25", reason: "新機種の差枚未算出" },
      ],
    }]);
    // The digit-2 periods themselves do not overlap, so their counts remain usable.
    expect(group(result, "2").pendingUnits?.[0]).toMatchObject({ days: 2, firstDate: "2026-09-21", lastDate: "2026-09-25" });
    expect(group(result, "2").pendingUnits?.[0]).not.toHaveProperty("overlappingPeriods");
    expect(validateHeatmapData(result)).toEqual(result);
  });

  test("sorts physical seat numbers numerically", () => {
    const result = withHeatmapCoverage(buildHeatmapFromSettingAim([]), [
      source(coverage(["2026-09-11"], "100"), "hundred"),
      source(coverage(["2026-09-11"], "9"), "nine"),
      source(coverage(["2026-09-11"], "20"), "twenty"),
    ]);
    expect(group(result, "all").pendingUnits?.map((row) => row.unit)).toEqual(["9", "20", "100"]);
  });

  test("records hidden and not-yet-computed machines without reviving their monetary data", () => {
    const hidden: Pick<Machine, "id" | "available" | "settingAim"> & { heatmapCoverage: HeatmapCoverage } = {
      id: "hidden", available: false, heatmapCoverage: coverage(["2026-09-11"], "650"),
      settingAim: { label: "設定狙い", unit: "%", note: "", dates: ["2026-09-11"], units: [{ unit: "650", avg: 200, days: 1, rates: [200], net: 99999 }] },
    };
    const pending = { id: "not-yet-computed", available: true, heatmapCoverage: coverage(["2026-09-11"], "651") };
    const data = buildHeatmapFromSettingAim([hidden, pending]);
    const result = withHeatmapCoverage(data, [hidden, pending]);
    expect(group(result, "all").units).toEqual([]);
    expect(group(result, "all").pendingUnits?.map((row) => row.unit)).toEqual(["650", "651"]);
    expect(summarizeUnits(group(result, "all").units).average).toBeNull();
  });
});
