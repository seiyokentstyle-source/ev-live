import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { getAvailableMachines, getShinjukuHeatmapCoverageSources } from "../machines";
import type { HeatmapData } from "./types";
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
    getAvailableMachines(), getCompatibilityMachines(), getShinjukuHeatmapCoverageSources(), getHistoryCoverageSnapshot(),
  ]);
  return withHeatmapCoverage(buildHeatmapFromSettingAim(machines, compatibilityMachines), selectHeatmapCoverage(coverageSources, coverageSnapshot));
}
