import type { FilterAxis, FilterAxisMatchMode } from "./types";

export function validateAggregateMatchModes(value: unknown, axes: FilterAxis[]): FilterAxisMatchMode[] {
  if (value === undefined) return axes.map(() => "single");
  if (!Array.isArray(value) || value.length !== axes.length ||
    value.some((mode, index) => (mode !== "single" && mode !== "bitmask") ||
      (mode === "bitmask" && axes[index].options.length > 30))) {
    throw new Error("Invalid machine data: aggregation axisMatchModes must match axes and bitmasks support at most 30 options");
  }
  return value as FilterAxisMatchMode[];
}

/** 圧縮を解いた場合にも、通常JSONと同じ行契約を検証する。 */
export function validateAggregateRows(value: unknown, axes: FilterAxis[], expectedRows?: number, axisMatchModes?: FilterAxisMatchMode[]): number[][] {
  const fail = (message: string): never => { throw new Error(`Invalid machine data: aggregation ${message}`); };
  if (!Array.isArray(value) || (expectedRows !== undefined && value.length !== expectedRows)) fail("row count is invalid");
  const rows = value as unknown[];
  const modes = validateAggregateMatchModes(axisMatchModes, axes);
  const cells = new Set<string>();
  for (const candidate of rows) {
    if (!Array.isArray(candidate) || candidate.length !== axes.length + 4 || !candidate.every(item => typeof item === "number" && Number.isFinite(item))) fail("row shape is invalid");
    const row = candidate as number[];
    if (!Number.isSafeInteger(row[0]) || row[0] < 0) fail("g is invalid");
    for (let index = 0; index < axes.length; index += 1) {
      const option = row[index + 1];
      const maximum = modes[index] === "bitmask" ? 2 ** axes[index].options.length - 1 : axes[index].options.length - 1;
      if (!Number.isSafeInteger(option) || option < -1 || option > maximum) fail("option index or bitmask is invalid");
    }
    const [n, normal, payout] = row.slice(axes.length + 1);
    if (!Number.isSafeInteger(n) || n < 0 || normal < 0 || payout < 0 || (n === 0 && (normal !== 0 || payout !== 0))) fail("totals are invalid");
    const key = JSON.stringify(row.slice(0, axes.length + 1));
    if (cells.has(key)) fail("cells must be unique");
    cells.add(key);
  }
  return value as number[][];
}
