import { buildHeatmapFromSettingAim, type HeatmapSourceMachine } from "./setting-aim";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A corrupt or old snapshot is ignored; the current setting table still supplies all-date data. */
export function settingAimCompatibilityMachines(value: unknown): HeatmapSourceMachine[] {
  if (!record(value) || value.schema !== "evlive-setting-aim-compat/v1" || !Array.isArray(value.machines)) return [];
  const ids = new Set<string>();
  for (const machine of value.machines) {
    if (!record(machine) || typeof machine.id !== "string" || typeof machine.available !== "boolean" || ids.has(machine.id)) return [];
    ids.add(machine.id);
    const aim = machine.settingAim;
    if (!record(aim) || !Array.isArray(aim.dates) || aim.dates.some((date) => typeof date !== "string") || !Array.isArray(aim.units)) return [];
    if (typeof aim.label !== "string" || typeof aim.unit !== "string" || typeof aim.note !== "string") return [];
    for (const unit of aim.units) {
      if (!record(unit) || typeof unit.unit !== "string" || !Number.isFinite(unit.avg) || !Array.isArray(unit.rates) ||
          typeof unit.days !== "number" || typeof unit.net !== "number") return [];
      if (unit.games !== undefined && (!Array.isArray(unit.games) || unit.games.length !== aim.dates.length ||
          unit.games.some((games) => !Number.isSafeInteger(games) || games < 0))) return [];
    }
  }
  const machines = value.machines as HeatmapSourceMachine[];
  try {
    // Reuse the normal observation/map checks before the snapshot can participate in a fallback.
    buildHeatmapFromSettingAim(machines);
  } catch {
    return [];
  }
  return machines;
}
