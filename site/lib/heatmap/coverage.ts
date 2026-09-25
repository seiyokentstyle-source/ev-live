import type { HeatmapCoverage, HeatmapCoverageUnit } from "../ev/types";
import { validateHeatmapCoverage } from "../ev/heatmap-coverage";
import { settingAimDateDigits } from "../ev/setting-aim-day-nets";
import type { HeatmapData, HeatmapPendingUnit } from "./types";
import { validateHeatmapData } from "./values";

export type HeatmapCoverageSource = { id: string; heatmapCoverage: HeatmapCoverage };
export type HeatmapCoverageMachine = { id: string; lastUpdated: string; heatmapCoverage?: HeatmapCoverage };
type SnapshotEntry = { id: string; lastUpdated: string; coverage: HeatmapCoverage };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function snapshotEntries(value: unknown): SnapshotEntry[] {
  if (value === undefined) return [];
  if (!record(value) || value.schema !== "shinjuku-history-coverage/v1" || value.hallId !== "shinjuku" || !Array.isArray(value.machines)) return [];
  const ids = new Set<string>();
  try {
    for (const entry of value.machines) {
      if (!record(entry) || typeof entry.id !== "string" || !entry.id || ids.has(entry.id) || typeof entry.lastUpdated !== "string") return [];
      ids.add(entry.id);
      settingAimDateDigits(entry.lastUpdated);
      validateHeatmapCoverage(entry.coverage, entry.lastUpdated);
    }
  } catch {
    return [];
  }
  return value.machines as SnapshotEntry[];
}

/** Select only history metadata; never promote held monetary data into the public population. */
export function selectHeatmapCoverage(current: readonly HeatmapCoverageMachine[], snapshot?: unknown): HeatmapCoverageSource[] {
  const selected = new Map<string, HeatmapCoverageSource>();
  const currentById = new Map(current.map((machine) => [machine.id, machine]));
  if (currentById.size !== current.length) throw new Error("Duplicate Shinjuku history coverage machine ID");
  for (const machine of current) {
    if (machine.heatmapCoverage !== undefined) selected.set(machine.id, { id: machine.id, heatmapCoverage: validateHeatmapCoverage(machine.heatmapCoverage, machine.lastUpdated) });
  }
  for (const entry of snapshotEntries(snapshot)) {
    if (selected.has(entry.id)) continue;
    const machine = currentById.get(entry.id);
    if (machine && machine.lastUpdated < entry.lastUpdated) continue;
    selected.set(entry.id, { id: entry.id, heatmapCoverage: entry.coverage });
  }
  return [...selected.values()];
}

type Period = HeatmapCoverageUnit & { reason: string };

/** Monetary rows always win in their own date group. Pending history never enters an average. */
export function withHeatmapCoverage(data: HeatmapData, sources: readonly HeatmapCoverageSource[]): HeatmapData {
  if (sources.length === 0) return data;
  for (const source of sources) validateHeatmapCoverage(source.heatmapCoverage);
  const groups = data.groups.map((group) => {
    const calculated = new Set(group.units.map((unit) => unit.unit));
    const periods = new Map<string, Period[]>();
    for (const source of sources) {
      for (const unit of source.heatmapCoverage.groups[group.key]) {
        if (calculated.has(unit.unit)) continue;
        const entries = periods.get(unit.unit) ?? [];
        entries.push({ unit: unit.unit, days: unit.days, firstDate: unit.firstDate, lastDate: unit.lastDate, reason: source.heatmapCoverage.reason });
        periods.set(unit.unit, entries);
      }
    }
    if (periods.size === 0) return group;
    const pendingUnits: HeatmapPendingUnit[] = [...periods].map(([unit, entries]) => {
      entries.sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.lastDate.localeCompare(b.lastDate));
      let lastDate = entries[0].lastDate;
      let overlap = false;
      for (const entry of entries.slice(1)) {
        if (entry.firstDate <= lastDate) overlap = true;
        if (entry.lastDate > lastDate) lastDate = entry.lastDate;
      }
      return {
        unit, days: overlap ? null : entries.reduce((sum, entry) => sum + entry.days, 0),
        firstDate: entries[0].firstDate, lastDate, reasons: [...new Set(entries.map((entry) => entry.reason))],
        ...(overlap ? { overlappingPeriods: entries.map(({ unit: _unit, ...entry }) => entry) } : {}),
      };
    }).sort((a, b) => Number(a.unit) - Number(b.unit) || a.unit.localeCompare(b.unit));
    return { ...group, pendingUnits };
  });
  return validateHeatmapData({ ...data, groups });
}
