import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import type { HeatmapData } from "./types";
import { validateHeatmapData } from "./values";

export async function getShinjukuHeatmapData(): Promise<HeatmapData | null> {
  const candidates = [
    path.join(process.cwd(), "data", "halls", "shinjuku-heatmap.json"),
    path.join(process.cwd(), "..", "data", "halls", "shinjuku-heatmap.json")
  ];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) return null;
  return validateHeatmapData(JSON.parse(await fs.readFile(file, "utf8")));
}
