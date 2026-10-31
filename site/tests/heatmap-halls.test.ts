import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Machine } from "../lib/ev/types";
import { buildHeatmapFromSettingAim } from "../lib/heatmap/setting-aim";
import { HEATMAP_HALL_IDS } from "../lib/heatmap/types";
import { validateHeatmapData } from "../lib/heatmap/values";

const { getMachines, getHallDisplays, getShinjukuHeatmapCoverageSources } = vi.hoisted(() => ({
  getMachines: vi.fn(), getHallDisplays: vi.fn(), getShinjukuHeatmapCoverageSources: vi.fn(),
}));
vi.mock("../lib/machines", () => ({ getMachines, getHallDisplays, getShinjukuHeatmapCoverageSources }));
import { getHeatmapData } from "../lib/heatmap/data";

function source(id: string, net: number): Machine {
  return {
    id, available: true, lastUpdated: "2026-10-21",
    settingAim: {
      label: "設定狙い", unit: "%", note: "公開済みの合計", dates: ["2026-10-21"],
      units: [{ unit: "1001", days: 1, net, avg: 100, rates: [100], games: [1000] }],
    },
  } as Machine;
}

beforeEach(() => { vi.resetAllMocks(); getHallDisplays.mockResolvedValue([]); getShinjukuHeatmapCoverageSources.mockResolvedValue([]); });

describe("heatmaps keep store-specific observations separate", () => {
  it.each(["akihabara", "kabuki"] as const)("loads only %s and never applies the Shinjuku compatibility snapshot", async (hallId) => {
    getMachines.mockImplementation(async (subdir: string) => [source(subdir, subdir === "akihabara" ? 500 : -300)]);
    getHallDisplays.mockImplementation(async (hall: string) => [{ kind: "machine", machine: source(hall, hall === "akihabara" ? 500 : -300) }]);
    const data = await getHeatmapData(hallId);
    expect(getMachines).toHaveBeenCalledExactlyOnceWith(hallId);
    expect(getHallDisplays).toHaveBeenCalledExactlyOnceWith(hallId);
    expect(getShinjukuHeatmapCoverageSources).not.toHaveBeenCalled();
    expect(data.hallId).toBe(hallId);
    expect(data.groups.find((group) => group.key === "all")?.units).toEqual([
      { unit: "1001", days: 1, net: hallId === "akihabara" ? 500 : -300 },
    ]);
    // Older JSON without digit totals must not acquire invented date-filter values.
    expect(data.groups.filter((group) => group.key !== "all").every((group) => group.units.length === 0)).toBe(true);
  });

  it("preserves the hall identity even when a store has no observations", async () => {
    getMachines.mockResolvedValue([]);
    const data = await getHeatmapData("kabuki");
    expect(data.hallId).toBe("kabuki");
    expect(data.dataFrom).toBeNull();
    expect(data.groups.every((group) => group.units.length === 0)).toBe(true);
  });

  it("accepts the three configured halls and rejects unknown or mixed populations", () => {
    for (const hallId of HEATMAP_HALL_IDS) {
      expect(buildHeatmapFromSettingAim([], [], hallId).hallId).toBe(hallId);
    }
    const empty = buildHeatmapFromSettingAim([]);
    for (const hallId of [undefined, "mixed", "mixed-raw", "unknown", "../kabuki"]) {
      expect(() => validateHeatmapData({ ...empty, hallId })).toThrow();
    }
  });
});
