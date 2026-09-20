import type { BaseAnchor, DecodedFilterAggregation, EvFilterTable, FilterAxis } from "./types";

export type AggregateFilterTable = Omit<EvFilterTable, "units"> & { units?: undefined };

/** evlive_calculation.round_ev と同じ半偶数丸め。浮動小数点の半円境界を正規化する。 */
export function roundAggregateEV(value: number, epsilon = 1e-8): number {
  if (!Number.isFinite(value) || !Number.isFinite(epsilon) || epsilon < 0 || epsilon >= 0.25) {
    throw new Error("Invalid EVLIVE rounding value or tolerance");
  }
  const floor = Math.floor(value);
  const fraction = Math.abs(value - (floor + 0.5)) <= epsilon ? 0.5 : value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** 一致する合計を先に足してから平均する。セル別の平均や機械割を平均しない。 */
export function aggregateFilterTable(
  data: DecodedFilterAggregation,
  axes: FilterAxis[],
  selection: Record<string, string | null>,
  fallbackStart: number
): AggregateFilterTable {
  const selected = axes.map(axis => {
    const value = selection[axis.key];
    return value == null ? null : axis.options.findIndex(option => option.value === value);
  });
  const byGame = new Map<number, { n: number; normal: number; payout: number }>();
  for (const row of data.rows) {
    if (selected.some((index, axis) => index !== null && (index < 0 || row[axis + 1] !== index))) continue;
    const [n, normal, payout] = row.slice(axes.length + 1);
    if (n <= 0) continue;
    const total = byGame.get(row[0]) ?? { n: 0, normal: 0, payout: 0 };
    total.n += n; total.normal += normal; total.payout += payout;
    byGame.set(row[0], total);
  }
  const baseAnchors: BaseAnchor[] = [...byGame.entries()].filter(([, total]) => {
    const investment = total.normal * data.costPerGame;
    const enoughInvestment = data.investmentMinimum === "mean" ? investment / total.n >= 1 : investment >= 1;
    return enoughInvestment && (data.minPlay === undefined || total.normal / total.n >= data.minPlay);
  }).sort(([a], [b]) => a - b).map(([g, total]) => {
    const profit = total.payout * data.exchange - total.normal * data.costPerGame;
    const games = total.normal + (data.junzou > 0 ? total.payout / data.junzou : 0);
    return { g, n: total.n, ev: roundAggregateEV(profit / total.n, data.roundingEpsilon),
      inv: total.normal * data.medalsPerGame / total.n, playG: games / total.n,
      rtp: games > 0 ? 100 + profit / (20 * data.bet * games) * 100 : 100 };
  });
  const first = baseAnchors[0];
  return { baseAnchors, start: first?.g ?? fallbackStart,
    end: baseAnchors.at(-1)?.g ?? fallbackStart,
    hits: first?.n ?? 0, totalPayout: first ? byGame.get(first.g)!.payout : 0, firstHitRate: null };
}
