import { describe, expect, test } from "vitest";
import { settingAimCompatibilityMachines } from "../lib/heatmap/setting-aim-compat";

function snapshot() {
  return {
    schema: "evlive-setting-aim-compat/v1",
    machines: [{
      id: "first", available: true,
      settingAim: { label: "設定狙い", unit: "%", note: "", dates: ["2026-09-11"], units: [{
        unit: "650", avg: 101, days: 1, rates: [101], games: [300], net: 100,
        dayDigitNets: { "1": { net: 100, days: 1 } },
      }] },
    }],
  };
}

describe("verified setting-aim compatibility snapshot", () => {
  test("accepts valid observations without changing their values", () => {
    const data = snapshot();
    expect(settingAimCompatibilityMachines(data)).toBe(data.machines);
  });

  test.each([undefined, null, [], {}, { schema: "old", machines: [] }, { schema: "evlive-setting-aim-compat/v1", machines: null }])("ignores unsupported snapshot %j", (value) => {
    expect(settingAimCompatibilityMachines(value)).toEqual([]);
  });

  test("does not silently pick one of duplicate machine IDs", () => {
    const data = snapshot();
    data.machines.push(structuredClone(data.machines[0]));
    expect(settingAimCompatibilityMachines(data)).toEqual([]);
  });

  test("ignores malformed or inconsistent observations", () => {
    const data = snapshot();
    data.machines[0].settingAim.units[0].dayDigitNets["1"].days = 2;
    expect(settingAimCompatibilityMachines(data)).toEqual([]);
  });

  test("ignores games that cannot be matched to the dates", () => {
    const data = snapshot();
    data.machines[0].settingAim.units[0].games = [];
    expect(settingAimCompatibilityMachines(data)).toEqual([]);
  });

  test("ignores duplicate machine-day observations", () => {
    const data = snapshot();
    data.machines.push({ ...structuredClone(data.machines[0]), id: "second" });
    expect(settingAimCompatibilityMachines(data)).toEqual([]);
  });
});
