import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { getAvailableMachines } from "../machines";
import type { HeatmapData } from "./types";
import { buildHeatmapFromSettingAim } from "./setting-aim";
import { settingAimCompatibilityMachines } from "./setting-aim-compat";

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
  const [machines, compatibilityMachines] = await Promise.all([getAvailableMachines(), getCompatibilityMachines()]);
  return buildHeatmapFromSettingAim(machines, compatibilityMachines);
}
