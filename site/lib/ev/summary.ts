import type { Machine, MachineSummary } from "./types";

/** 設定狙い表の総回転（台×日）を合計する。表が無い機種は undefined。 */
export function settingAimGames(machine: Pick<Machine, "settingAim">): number | undefined {
  const units = machine.settingAim?.units;
  if (!units) return undefined;
  let total = 0;
  for (const unit of units) for (const games of unit.games ?? []) if (typeof games === "number" && games > 0) total += games;
  return total > 0 ? total : undefined;
}

// 表示の都合で設定狙い表を外した機種でも、総回転は実測なので一覧の合計には残す。
const retainedGames = new WeakMap<object, number>();

/** 設定狙い表を外す前の総回転を、外した後の機種に結び付けておく。 */
export function retainSettingAimGames<T extends object>(next: T, original: Pick<Machine, "settingAim">): T {
  const games = settingAimGames(original) ?? retainedGames.get(original);
  if (games !== undefined) retainedGames.set(next, games);
  return next;
}

/** 別の店舗から合計した総回転を機種に結び付ける（混合表用）。 */
export function retainGames<T extends object>(next: T, games: number): T {
  retainedGames.set(next, games);
  return next;
}

/** List and hall-selection pages need counts and labels, not the complete EV tables. */
export function machineSummary(machine: MachineSummary & Partial<Pick<Machine, "settingAim">>): MachineSummary {
  const { id, name, manufacturer, aliases, available, thumb, releaseDate, lastUpdated, meta } = machine;
  const games = machine.games ?? settingAimGames(machine) ?? retainedGames.get(machine);
  return { id, name, manufacturer, aliases, available, thumb, releaseDate, lastUpdated, meta, ...(games !== undefined ? { games } : {}) };
}
