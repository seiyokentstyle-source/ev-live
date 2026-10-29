import type { Machine, MachineSummary } from "./types";

/** 設定狙い表の総回転（台×日）を合計する。表が無い機種は undefined。 */
export function settingAimGames(machine: Pick<Machine, "settingAim">): number | undefined {
  const units = machine.settingAim?.units;
  if (!units) return undefined;
  let total = 0;
  for (const unit of units) for (const games of unit.games ?? []) if (typeof games === "number" && games > 0) total += games;
  return total > 0 ? total : undefined;
}

/** List and hall-selection pages need counts and labels, not the complete EV tables. */
export function machineSummary(machine: MachineSummary & Partial<Pick<Machine, "settingAim">>): MachineSummary {
  const { id, name, manufacturer, aliases, available, thumb, releaseDate, lastUpdated, meta } = machine;
  const games = machine.games ?? settingAimGames(machine);
  return { id, name, manufacturer, aliases, available, thumb, releaseDate, lastUpdated, meta, ...(games !== undefined ? { games } : {}) };
}
