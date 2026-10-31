import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import type { Machine } from "../lib/ev/types";
import { HEATMAP_GROUP_KEYS } from "../lib/heatmap/types";
import { catalogFixture } from "./fixtures/collection-status";

const halls = ["shinjuku", "akihabara", "kabuki"] as const;
const date = "2026-09-26";
let root: string;

function input(id: string, unit: string, net: number): Machine {
  const name = id === "m1545c941" ? "Lパチスロ 炎炎ノ消防隊2" : "公開中の別機種";
  return {
    ...structuredClone(fixture), id, name, aliases: [name, id],
    available: true, lastUpdated: date,
    settingAim: { label: "設定狙い", unit: "%", note: "合成テスト", dates: [date],
      units: [{ unit, avg: 110, days: 1, rates: [110], games: [1000], net, dayDigitNets: {
        "2": { days: 1, net }, "6": { days: 1, net },
      } }] },
  } as Machine;
}

async function writeMachine(machine: Machine, hall: string) {
  const dir = path.join(root, "data", "machines", hall === "shinjuku" ? "" : hall);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${machine.id}.json`), JSON.stringify(machine));
}

async function writeHold(machine: Machine, hall: string, forcePending = true) {
  const catalog = catalogFixture(machine.id, forcePending, hall);
  if (hall === "akihabara") Object.assign(catalog, { source: "site_seven", storeId: "00000001" });
  Object.assign(catalog.machines[0], { name: machine.name, aliases: machine.aliases });
  catalog.machines[0].sourceIntegrity.machineName = machine.name;
  const dir = path.join(root, "data", "halls", hall);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "collection-status.json"), JSON.stringify(catalog));
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "evlive-heatmap-admission-"));
  await fs.mkdir(path.join(root, "data", "machines"), { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.resetModules();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe("heatmaps respect the public numerical admission boundary", () => {
  it.each(halls)("excludes a forcePending %s model from all and digit groups even while raw settingAim remains", async hall => {
    const held = input("m1545c941", "864", 583939);
    const published = input("neighbor", "865", -3000);
    await writeMachine(held, hall);
    await writeHold(held, hall);
    await writeMachine(published, hall);
    // The same machine in another store must not replace this store's held input.
    await writeMachine(input(held.id, "864", 500), hall === "kabuki" ? "shinjuku" : "kabuki");
    const { getMachines } = await import("../lib/machines");
    const { getLiveMachine } = await import("../lib/live-data");
    const { getHeatmapData } = await import("../lib/heatmap/data");
    expect((await getMachines(hall === "shinjuku" ? undefined : hall)).find(machine => machine.id === held.id)?.settingAim)
      .toEqual(held.settingAim);
    expect((await getLiveMachine(held.id, hall))?.schema).toBe("evlive-live-collection/v1");
    const data = await getHeatmapData(hall);
    for (const group of data.groups) {
      expect(group.units.some(unit => unit.unit === "864")).toBe(false);
      expect(group.pendingUnits?.some(unit => unit.unit === "864") ?? false).toBe(false);
    }
    for (const key of ["all", "2", "6"]) {
      expect(data.groups.find(group => group.key === key)?.units).toEqual([{ unit: "865", net: -3000, days: 1 }]);
    }
  });

  it.each(halls)("preserves explicitly supplied %s history coverage without admitting its held amounts", async hall => {
    const held = input("m1545c941", "864", 583939);
    held.heatmapCoverage = {
      schema: "heatmap-coverage/v1", reason: "獲得枚数の対応を確認中",
      groups: Object.fromEntries(HEATMAP_GROUP_KEYS.map(key => [key,
        ["all", "2", "6"].includes(key) ? [{ unit: "864", days: 1, firstDate: date, lastDate: date }] : [],
      ])) as NonNullable<Machine["heatmapCoverage"]>["groups"],
    };
    await writeMachine(held, hall);
    await writeHold(held, hall);
    const { getHeatmapData } = await import("../lib/heatmap/data");
    const data = await getHeatmapData(hall);
    expect(data.groups.every(group => group.units.length === 0)).toBe(true);
    for (const key of ["all", "2", "6"]) {
      expect(data.groups.find(group => group.key === key)?.pendingUnits).toEqual([
        { unit: "864", days: 1, firstDate: date, lastDate: date, reasons: ["獲得枚数の対応を確認中"] },
      ]);
    }
  });

  it("admits the same source when the public hold is removed instead of clipping amounts by a threshold", async () => {
    const published = input("m1545c941", "864", 583939);
    await writeMachine(published, "kabuki");
    await writeHold(published, "kabuki", false);
    const { getHeatmapData } = await import("../lib/heatmap/data");
    const data = await getHeatmapData("kabuki");
    expect(data.groups.find(group => group.key === "all")?.units).toEqual([{ unit: "864", net: 583939, days: 1 }]);
  });
});
