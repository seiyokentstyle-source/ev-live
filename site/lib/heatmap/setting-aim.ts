import type { Machine, SettingAim, SettingAimUnit } from "../ev/types";
import { SETTING_AIM_DAY_DIGITS, settingAimDateDigits, validateSettingAimDayDigitNets } from "../ev/setting-aim-day-nets";
import { HEATMAP_GROUP_KEYS, type HeatmapData, type HeatmapGroupKey, type HeatmapUnit } from "./types";
import { groupLabel, validateHeatmapData } from "./values";

export type HeatmapSourceMachine = Pick<Machine, "id" | "available" | "settingAim">;

type Aggregate = {
  firstDate: string | null;
  lastDate: string | null;
  units: Map<string, HeatmapUnit>;
};

/** Reuse only already-published observations that the current data still contains unchanged. */
function compatibleDigitSource(aim: SettingAim, unit: SettingAimUnit, fallback: HeatmapSourceMachine | undefined) {
  const previousAim = fallback?.available ? fallback.settingAim : undefined;
  const previousUnit = previousAim?.units.find((value) => value.unit === unit.unit);
  if (!previousAim || !previousUnit?.dayDigitNets || !Array.isArray(unit.games) || !Array.isArray(previousUnit.games)) return;
  if (unit.games.length !== aim.dates.length || previousUnit.games.length !== previousAim.dates.length || previousUnit.rates.length !== previousAim.dates.length) return;
  const dates = previousAim.dates.filter((_, index) => previousUnit.rates[index] !== null);
  if (dates.length === 0 || dates.length !== previousUnit.days || new Set(dates).size !== dates.length) return;
  if (dates.length === unit.days && previousUnit.net !== unit.net) return;
  try {
    validateSettingAimDayDigitNets(previousUnit.dayDigitNets, dates, previousUnit.unit);
    for (const date of dates) {
      const previousIndex = previousAim.dates.indexOf(date);
      const currentIndex = aim.dates.indexOf(date);
      const games = previousUnit.games[previousIndex];
      if (currentIndex < 0 || !Number.isFinite(previousUnit.rates[previousIndex]) || !Number.isSafeInteger(games) || games < 0 ||
          unit.rates[currentIndex] !== previousUnit.rates[previousIndex] || unit.games[currentIndex] !== games) return;
    }
  } catch {
    return;
  }
  return { dates, nets: previousUnit.dayDigitNets };
}

/** Share the published setting table's observations and net values, including historic placements. */
export function buildHeatmapFromSettingAim(machines: readonly HeatmapSourceMachine[], fallbackMachines: readonly HeatmapSourceMachine[] = []): HeatmapData {
  const groups = new Map<HeatmapGroupKey, Aggregate>(HEATMAP_GROUP_KEYS.map((key) => [key, { firstDate: null, lastDate: null, units: new Map() }]));
  const observations = new Map<string, string>();
  const digitObservations = new Set<string>();
  const fallbackById = new Map(fallbackMachines.map((machine) => [machine.id, machine]));
  let snapshotFallbackTo: string | undefined;

  function add(key: HeatmapGroupKey, unit: string, net: number, days: number, dates: readonly string[]) {
    const group = groups.get(key)!;
    const current = group.units.get(unit) ?? { unit, net: 0, days: 0 };
    group.units.set(unit, { unit, net: current.net + net, days: current.days + days });
    for (const date of dates) {
      group.firstDate = group.firstDate === null || date < group.firstDate ? date : group.firstDate;
      group.lastDate = group.lastDate === null || date > group.lastDate ? date : group.lastDate;
    }
  }

  for (const machine of machines) {
    if (!machine.available || !machine.settingAim) continue;
    const aim = machine.settingAim;
    for (const date of aim.dates) settingAimDateDigits(date);
    for (const unit of aim.units) {
      if (unit.rates.length !== aim.dates.length || unit.rates.some((rate) => rate !== null && !Number.isFinite(rate))) {
        throw new Error(`Invalid setting-aim rates for heatmap: ${machine.id} / ${unit.unit}`);
      }
      const dates = aim.dates.filter((_, index) => unit.rates[index] !== null);
      if (!Number.isSafeInteger(unit.days) || unit.days !== dates.length || !Number.isFinite(unit.net)) {
        throw new Error(`Inconsistent setting-aim totals for heatmap: ${machine.id} / ${unit.unit}`);
      }
      for (const date of dates) {
        settingAimDateDigits(date);
        const key = `${unit.unit}\0${date}`;
        const previous = observations.get(key);
        if (previous !== undefined) {
          // Period totals cannot be partially de-duplicated without daily net values.
          throw new Error(`Duplicate setting-aim observation for heatmap: ${unit.unit} / ${date} (${previous}, ${machine.id})`);
        }
        observations.set(key, machine.id);
      }
      validateSettingAimDayDigitNets(unit.dayDigitNets, dates, unit.unit);
      if (dates.length === 0) continue;
      add("all", unit.unit, unit.net, unit.days, dates);
      const digitSource = unit.dayDigitNets !== undefined
        ? { dates, nets: unit.dayDigitNets }
        : compatibleDigitSource(aim, unit, fallbackById.get(machine.id));
      if (!digitSource) continue;
      if (unit.dayDigitNets === undefined) {
        for (const date of digitSource.dates) {
          if (snapshotFallbackTo === undefined || date > snapshotFallbackTo) snapshotFallbackTo = date;
        }
      }
      for (const digit of SETTING_AIM_DAY_DIGITS) {
        const subtotal = digitSource.nets[digit];
        if (!subtotal) continue;
        const matchingDates = digitSource.dates.filter((date) => settingAimDateDigits(date).includes(digit));
        for (const date of matchingDates) {
          const key = `${digit}\0${unit.unit}\0${date}`;
          if (digitObservations.has(key)) throw new Error(`Duplicate setting-aim digit observation for heatmap: ${digit} / ${unit.unit} / ${date}`);
          digitObservations.add(key);
        }
        add(digit, unit.unit, subtotal.net, subtotal.days, matchingDates);
      }
    }
  }

  const all = groups.get("all")!;
  return validateHeatmapData({
    schema: "evlive-floor-heatmap/v1", hallId: "shinjuku", metric: "net", estimated: true,
    dataFrom: all.firstDate, dataTo: all.lastDate,
    ...(snapshotFallbackTo === undefined ? {} : { snapshotFallbackTo }),
    groups: HEATMAP_GROUP_KEYS.map((key) => {
      const group = groups.get(key)!;
      return { key, label: groupLabel(key), firstDate: group.firstDate, lastDate: group.lastDate,
        units: [...group.units.values()].sort((a, b) => Number(a.unit) - Number(b.unit) || a.unit.localeCompare(b.unit)) };
    })
  });
}
