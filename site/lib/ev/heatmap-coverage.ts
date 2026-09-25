import type { HeatmapCoverage, HeatmapCoverageUnit, SettingAimDayDigit } from "./types";
import { SETTING_AIM_DAY_DIGITS, settingAimDateDigits } from "./setting-aim-day-nets";

export const HEATMAP_COVERAGE_KEYS = ["all", ...SETTING_AIM_DAY_DIGITS] as const;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(): never {
  throw new Error("Invalid machine data: heatmapCoverage");
}

export function validateHeatmapCoverageUnit(value: unknown): HeatmapCoverageUnit {
  if (!record(value) || typeof value.unit !== "string" || !/^[1-9]\d*$/.test(value.unit) || !Number.isSafeInteger(Number(value.unit)) || !Number.isSafeInteger(value.days) ||
      (value.days as number) <= 0 || typeof value.firstDate !== "string" || typeof value.lastDate !== "string") return fail();
  settingAimDateDigits(value.firstDate);
  settingAimDateDigits(value.lastDate);
  const span = (Date.parse(value.lastDate) - Date.parse(value.firstDate)) / 86400000 + 1;
  if (span < 1 || (value.days as number) > span) return fail();
  return value as HeatmapCoverageUnit;
}

/** Counts are aggregate presence, never a zero-net substitute. */
export function validateHeatmapCoverage(value: unknown, lastUpdated?: string): HeatmapCoverage {
  if (!record(value) || value.schema !== "heatmap-coverage/v1" || typeof value.reason !== "string" || !value.reason.trim() || !record(value.groups)) return fail();
  if (Object.keys(value).some((key) => !["schema", "reason", "groups"].includes(key))) return fail();
  if (lastUpdated !== undefined) settingAimDateDigits(lastUpdated);
  const keys = Object.keys(value.groups);
  if (keys.length !== HEATMAP_COVERAGE_KEYS.length || keys.some((key) => !HEATMAP_COVERAGE_KEYS.includes(key as typeof HEATMAP_COVERAGE_KEYS[number]))) return fail();
  for (const key of HEATMAP_COVERAGE_KEYS) {
    const rows = value.groups[key];
    if (!Array.isArray(rows)) return fail();
    const units = new Set<string>();
    for (const item of rows) {
      if (!record(item) || Object.keys(item).some((key) => !["unit", "days", "firstDate", "lastDate"].includes(key))) return fail();
      const row = validateHeatmapCoverageUnit(item);
      if (lastUpdated !== undefined && row.lastDate > lastUpdated) return fail();
      if (units.has(row.unit)) return fail();
      units.add(row.unit);
      if (key !== "all" && (!settingAimDateDigits(row.firstDate).includes(key) || !settingAimDateDigits(row.lastDate).includes(key))) return fail();
    }
  }
  const coverage = value as HeatmapCoverage;
  const all = new Map(coverage.groups.all.map((row) => [row.unit, row]));
  for (const digit of SETTING_AIM_DAY_DIGITS) {
    for (const row of coverage.groups[digit]) {
      const total = all.get(row.unit);
      if (!total || row.days > total.days || row.firstDate < total.firstDate || row.lastDate > total.lastDate) return fail();
      // There cannot be more observations than matching calendar days in this range.
      const start = new Date(row.firstDate);
      const end = new Date(row.lastDate);
      let matching = 0;
      for (let day = start; day <= end; day = new Date(day.getTime() + 86400000)) {
        if (String(day.getUTCDate()).includes(digit as SettingAimDayDigit)) matching += 1;
      }
      if (row.days > matching) return fail();
    }
  }
  return coverage;
}
