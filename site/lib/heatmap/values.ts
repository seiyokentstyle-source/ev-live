import { HEATMAP_GROUP_KEYS, type FloorLayout, type HeatmapData, type HeatmapGroupKey, type HeatmapUnit } from "./types";

export function groupLabel(key: HeatmapGroupKey): string {
  return key === "all" ? "日付不問" : `${key}のつく日`;
}

/** The original floor has a wide blank top-left area. Start at the first island. */
export function initialMapScroll(floor: FloorLayout, boardWidth: number, viewportWidth: number) {
  const first = floor.seats.reduce<FloorLayout["seats"][number] | undefined>((earliest, seat) => !earliest || seat.y < earliest.y || (seat.y === earliest.y && seat.x < earliest.x) ? seat : earliest, undefined);
  if (!first) return { left: 0, top: 0 };
  const scale = boardWidth / floor.width;
  return { left: Math.max(0, first.x * scale + 16 - Math.min(80, viewportWidth / 5)), top: Math.max(0, first.y * scale - 24) };
}

export function averageNet(unit: HeatmapUnit | undefined): number | null {
  return unit && unit.days > 0 && Number.isFinite(unit.net) ? unit.net / unit.days : null;
}

/** Each observed machine-day has equal weight, including days with net zero. */
export function summarizeUnits(units: readonly HeatmapUnit[]) {
  const totals = units.reduce((sum, unit) => ({ days: sum.days + unit.days, net: sum.net + unit.net }), { days: 0, net: 0 });
  return { ...totals, average: totals.days > 0 ? totals.net / totals.days : null };
}

export function formatNet(value: number | null): string {
  if (value === null) return "データなし";
  const rounded = Math.round(value) || 0;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("ja-JP")}枚`;
}

/** A fixed scale makes colors comparable when the date filter changes. */
export function heatColor(value: number | null): { background: string; foreground: string; empty: boolean } {
  if (value === null || !Number.isFinite(value)) return { background: "#293440", foreground: "#b6c0cd", empty: true };
  const background = value <= -2000 ? "#4174b0" : value <= -1000 ? "#7da5d1" : value <= -500 ? "#acc9e4" : value < 0 ? "#d1e1eb" : value === 0 ? "#eee9d9" : value < 500 ? "#f1d9c1" : value < 1000 ? "#edb58f" : value < 2000 ? "#e98d73" : "#df6758";
  return { background, foreground: value <= -2000 ? "#ffffff" : "#142130", empty: false };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dateOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
}

export function validateHeatmapData(value: unknown): HeatmapData {
  const fail = (): never => { throw new Error("Invalid Shinjuku heatmap aggregate data"); };
  if (!record(value) || value.schema !== "evlive-floor-heatmap/v1" || value.hallId !== "shinjuku" || value.metric !== "net" || value.estimated !== true || !dateOrNull(value.dataFrom) || !dateOrNull(value.dataTo) || !Array.isArray(value.groups)) return fail();
  if ((value.dataFrom === null) !== (value.dataTo === null) || (value.dataFrom && value.dataTo && value.dataFrom > value.dataTo)) return fail();
  if (value.snapshotFallbackTo !== undefined && (typeof value.snapshotFallbackTo !== "string" || !dateOrNull(value.snapshotFallbackTo) ||
      !value.dataFrom || !value.dataTo || value.snapshotFallbackTo < value.dataFrom || value.snapshotFallbackTo > value.dataTo)) return fail();
  const groupKeys = new Set<string>();
  for (const group of value.groups) {
    if (!record(group) || typeof group.key !== "string" || !HEATMAP_GROUP_KEYS.includes(group.key as HeatmapGroupKey) || groupKeys.has(group.key) || typeof group.label !== "string" || !dateOrNull(group.firstDate) || !dateOrNull(group.lastDate) || !Array.isArray(group.units)) return fail();
    groupKeys.add(group.key);
    if ((group.firstDate === null) !== (group.lastDate === null) || (group.firstDate && group.lastDate && group.firstDate > group.lastDate)) return fail();
    if (group.units.length && (!group.firstDate || !group.lastDate || !value.dataFrom || !value.dataTo)) return fail();
    if (!group.units.length && (group.firstDate !== null || group.lastDate !== null)) return fail();
    if (group.firstDate && value.dataFrom && group.firstDate < value.dataFrom) return fail();
    if (group.lastDate && value.dataTo && group.lastDate > value.dataTo) return fail();
    const units = new Set<string>();
    for (const unit of group.units) {
      if (!record(unit) || typeof unit.unit !== "string" || !/^\d+$/.test(unit.unit) || units.has(unit.unit) || !Number.isInteger(unit.days) || (unit.days as number) < 1 || typeof unit.net !== "number" || !Number.isFinite(unit.net)) return fail();
      const span = group.firstDate && group.lastDate ? (Date.parse(group.lastDate) - Date.parse(group.firstDate)) / 86400000 + 1 : 0;
      if ((unit.days as number) > span) return fail();
      units.add(unit.unit);
    }
  }
  if (groupKeys.size !== HEATMAP_GROUP_KEYS.length) return fail();
  const data = value as HeatmapData;
  const all = data.groups.find((group) => group.key === "all")!;
  if (all.firstDate !== data.dataFrom || all.lastDate !== data.dataTo) return fail();
  const allUnits = new Map(all.units.map((unit) => [unit.unit, unit]));
  for (const group of data.groups) {
    for (const unit of group.units) {
      const total = allUnits.get(unit.unit);
      if (!total || unit.days > total.days) return fail();
    }
  }
  return data;
}
