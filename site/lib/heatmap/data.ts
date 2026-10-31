import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { getHallDisplays, getMachines, getShinjukuHeatmapCoverageSources } from "../machines";
import type { HeatmapData, HeatmapHallId } from "./types";
import { buildHeatmapFromSettingAim } from "./setting-aim";
import { settingAimCompatibilityMachines } from "./setting-aim-compat";
import { selectHeatmapCoverage, withHeatmapCoverage } from "./coverage";

async function getHistoryCoverageSnapshot(): Promise<unknown> {
  const relativePath = path.join("data", "halls", "shinjuku-history-coverage.json");
  const file = [path.join(process.cwd(), relativePath), path.join(process.cwd(), "..", relativePath)].find(existsSync);
  if (!file) return undefined;
  const raw = await fs.readFile(file, "utf8");
  try { return JSON.parse(raw); } catch { return undefined; }
}

async function getCompatibilityMachines() {
  const relativePath = path.join("data", "halls", "shinjuku-setting-aim-compat.json");
  const file = [path.join(process.cwd(), relativePath), path.join(process.cwd(), "..", relativePath)].find(existsSync);
  if (!file) return [];
  const raw = await fs.readFile(file, "utf8");
  try {
    return settingAimCompatibilityMachines(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function getShinjukuHeatmapData(): Promise<HeatmapData> {
  const [machines, compatibilityMachines, coverageSources, coverageSnapshot] = await Promise.all([
    publishedHeatmapMachines("shinjuku"), getCompatibilityMachines(), getShinjukuHeatmapCoverageSources(), getHistoryCoverageSnapshot(),
  ]);
  return withHeatmapCoverage(buildHeatmapFromSettingAim(machines, compatibilityMachines), selectHeatmapCoverage(coverageSources, coverageSnapshot));
}

/** Apply the same holds and identity selection as the public machine pages. */
async function publishedHeatmapMachines(hallId: HeatmapHallId) {
  return (await getHallDisplays(hallId)).flatMap((display) => display.kind === "machine" ? [display.machine] : []);
}

/** Read one store at a time. Unit numbers and compatibility snapshots never cross halls. */
export async function getHeatmapData(hallId: HeatmapHallId): Promise<HeatmapData> {
  if (hallId === "shinjuku") return getShinjukuHeatmapData();
  const [machines, coverageSources] = await Promise.all([
    publishedHeatmapMachines(hallId), getMachines(hallId),
  ]);
  return withHeatmapCoverage(
    buildHeatmapFromSettingAim(machines, [], hallId),
    selectHeatmapCoverage(coverageSources),
  );
}
