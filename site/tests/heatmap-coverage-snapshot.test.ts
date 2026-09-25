import { describe, expect, test } from "vitest";
import type { HeatmapCoverage } from "../lib/ev/types";
import { selectHeatmapCoverage, withHeatmapCoverage } from "../lib/heatmap/coverage";
import { buildHeatmapFromSettingAim } from "../lib/heatmap/setting-aim";
import { HEATMAP_GROUP_KEYS } from "../lib/heatmap/types";

function coverage(unit = "650", reason = "差枚未算出"): HeatmapCoverage {
  const groups = Object.fromEntries(HEATMAP_GROUP_KEYS.map((key) => [key, []])) as HeatmapCoverage["groups"];
  for (const key of ["all", "1"] as const) {
    groups[key].push({ unit, days: 1, firstDate: "2026-09-11", lastDate: "2026-09-11" });
  }
  return { schema: "heatmap-coverage/v1", reason, groups };
}

function snapshot(id = "pending", value = coverage(), lastUpdated = "2026-09-11") {
  return { schema: "shinjuku-history-coverage/v1", hallId: "shinjuku", machines: [{ id, lastUpdated, coverage: value }] };
}

describe("heatmap coverage compatibility snapshot", () => {
  test("keeps legacy machines without a snapshot unchanged", () => {
    expect(selectHeatmapCoverage([{ id: "legacy", lastUpdated: "2026-09-12" }])).toEqual([]);
    expect(selectHeatmapCoverage([])).toEqual([]);
  });

  test("uses a machine's current coverage in preference to its sidecar", () => {
    const current = coverage("651", "現在の集計理由");
    const result = selectHeatmapCoverage([{ id: "pending", lastUpdated: "2026-09-12", heatmapCoverage: current }], snapshot());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "pending", heatmapCoverage: current });
  });

  test.each(["2026-09-11", "2026-09-12"])("uses the preserved coverage after an older collector write dated %s", (lastUpdated) => {
    const value = coverage();
    const result = selectHeatmapCoverage([{ id: "pending", lastUpdated }], snapshot("pending", value));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "pending", heatmapCoverage: value });
  });

  test("does not use snapshot data newer than the current machine payload", () => {
    expect(selectHeatmapCoverage([{ id: "pending", lastUpdated: "2026-09-10" }], snapshot())).toEqual([]);
  });

  test("rejects current coverage whose observations extend beyond its machine's update date", () => {
    expect(() => selectHeatmapCoverage([{ id: "pending", lastUpdated: "2026-09-10", heatmapCoverage: coverage() }], snapshot())).toThrow();
  });

  test("ignores snapshot coverage whose observations extend beyond its enclosing update date", () => {
    const futureCoverage = snapshot("pending", coverage(), "2026-09-10");
    expect(selectHeatmapCoverage([{ id: "pending", lastUpdated: "2026-09-12" }], futureCoverage)).toEqual([]);
    expect(selectHeatmapCoverage([], futureCoverage)).toEqual([]);
  });

  test("retains independently collected coverage for a machine with no public machine JSON", () => {
    const value = coverage();
    const result = selectHeatmapCoverage([], snapshot("unpublished", value));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "unpublished", heatmapCoverage: value });
    const data = withHeatmapCoverage(buildHeatmapFromSettingAim([]), result);
    expect(data.groups.find((group) => group.key === "all")).toMatchObject({ units: [], pendingUnits: [{ unit: "650", days: 1 }] });
    expect(data.dataFrom).toBeNull();
    expect(data.dataTo).toBeNull();
  });

  test("combines current-only, snapshot-only, and matching legacy machines once each", () => {
    const raw = snapshot("legacy", coverage("650"));
    raw.machines.push({ id: "unpublished", lastUpdated: "2026-09-11", coverage: coverage("651") });
    const result = selectHeatmapCoverage([
      { id: "legacy", lastUpdated: "2026-09-12" },
      { id: "current-only", lastUpdated: "2026-09-12", heatmapCoverage: coverage("652") },
    ], raw);
    expect(result.map((entry) => entry.id).sort()).toEqual(["current-only", "legacy", "unpublished"]);
  });

  test("selects only presence metadata from a snapshot instead of restoring monetary data", () => {
    const raw = snapshot();
    const supplied = { ...raw, machines: [{ ...raw.machines[0], available: true, settingAim: { net: 999999 }, profiles: [{ ev: 888888 }] }] };
    const result = selectHeatmapCoverage([], supplied);
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("settingAim");
    expect(result[0]).not.toHaveProperty("profiles");
    expect(withHeatmapCoverage(buildHeatmapFromSettingAim([]), result).groups.every((group) => group.units.length === 0)).toBe(true);
  });

  test.each([undefined, null, [], {}, { schema: "obsolete", hallId: "shinjuku", machines: [] }])("ignores unsupported optional snapshot %j", (raw) => {
    expect(selectHeatmapCoverage([], raw)).toEqual([]);
    const value = coverage();
    expect(selectHeatmapCoverage([{ id: "current", lastUpdated: "2026-09-12", heatmapCoverage: value }], raw)).toMatchObject([{ id: "current", heatmapCoverage: value }]);
  });

  test("does not use another hall's snapshot", () => {
    expect(selectHeatmapCoverage([], { ...snapshot(), hallId: "akihabara" })).toEqual([]);
  });

  test("does not accept a malformed source date", () => {
    expect(selectHeatmapCoverage([], snapshot("pending", coverage(), "2026-09-31"))).toEqual([]);
  });

  test("ignores malformed coverage without dropping valid current metadata", () => {
    const raw = snapshot();
    raw.machines[0].coverage.groups.all[0].days = 0;
    const value = coverage("651");
    const result = selectHeatmapCoverage([{ id: "current", lastUpdated: "2026-09-12", heatmapCoverage: value }], raw);
    expect(result).toMatchObject([{ id: "current", heatmapCoverage: value }]);
    expect(result).toHaveLength(1);
  });

  test("does not choose an arbitrary coverage row from duplicate snapshot machine IDs", () => {
    const raw = snapshot();
    raw.machines.push({ ...raw.machines[0], coverage: coverage("651") });
    expect(selectHeatmapCoverage([], raw)).toEqual([]);
  });
});
