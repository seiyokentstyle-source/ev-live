import { normalInvestmentMedals, validateNormalCostSchedule } from './normal-cost-core.mjs';

/** Match Python's half-even EV rounding, including its floating-point tolerance. */
export function roundAggregateEV(value, epsilon = 1e-8) {
  if (!Number.isFinite(value) || !Number.isFinite(epsilon) || epsilon < 0 || epsilon >= 0.25) {
    throw new Error("Invalid EVOT rounding value or tolerance");
  }
  const floor = Math.floor(value);
  const fraction = Math.abs(value - (floor + 0.5)) <= epsilon ? 0.5 : value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Merge counts and totals before calculating means; shared by server and browser. */
export function aggregateFilterTable(data, axes, selection, fallbackStart, heldMedals = 0) {
  const schedule = validateNormalCostSchedule(data.normalCostSchedule, data.medalsPerGame, data.schema);
  if (!Number.isSafeInteger(heldMedals) || heldMedals < 0) throw new Error('Held medals must be a nonnegative safe integer');
  if (heldMedals > 0 && data.schema !== 'evlive-filter-aggregates/v2') {
    throw new Error('Held-medal calculation requires an exact v2 investment distribution');
  }
  const exchangeGap = data.costPerGame / data.medalsPerGame - data.exchange;
  if (heldMedals > 0 && (!Number.isFinite(exchangeGap) || exchangeGap < -1e-9)) throw new Error('Invalid held-medal exchange rates');
  // 1軸で複数の値を選んだときは "a|b" で渡る。どれかに当てはまる行を足し合わせる
  // （件数・通常時G・獲得の合計なので、区間をまとめても平均の計算は正確）。
  const selected = axes.map(axis => {
    const value = selection[axis.key];
    if (value == null) return null;
    return String(value).split("|").map(part => axis.options.findIndex(option => option.value === part))
      .filter(index => index >= 0);
  });
  const byGame = new Map();
  for (const row of data.rows) {
    if (selected.some((indexes, axis) => {
      if (indexes === null) return false;
      const value = row[axis + 1];
      if (indexes.length === 0) return true;
      return data.axisMatchModes?.[axis] === "bitmask"
        ? value < 0 || !indexes.some(index => (value & 2 ** index) !== 0)
        : !indexes.includes(value);
    })) continue;
    const [n, normal, payout] = row.slice(axes.length + 1);
    if (n <= 0) continue;
    const total = byGame.get(row[0]) ?? { n: 0, normal: 0, payout: 0, held: 0, medals: 0 };
    total.n += n; total.normal += normal; total.payout += payout;
    const medals = normalInvestmentMedals(row[0], normal / n, data.medalsPerGame, schedule);
    if (schedule) total.medals += n * medals;
    // v2 rows share one exact normal-game investment. Cap within each row
    // before merging; capping the merged mean would overstate the benefit.
    if (heldMedals > 0) total.held += n * Math.min(heldMedals, medals);
    byGame.set(row[0], total);
  }
  const baseAnchors = [...byGame.entries()].filter(([, total]) => {
    const investment = schedule ? total.medals * (data.costPerGame / data.medalsPerGame) : total.normal * data.costPerGame;
    const enoughInvestment = data.investmentMinimum === "mean" ? investment / total.n >= 1 : investment >= 1;
    return enoughInvestment && (data.minPlay === undefined || total.normal / total.n >= data.minPlay);
  }).sort(([a], [b]) => a - b).map(([g, total]) => {
    const medals = schedule ? total.medals : total.normal * data.medalsPerGame;
    const investment = schedule ? medals * (data.costPerGame / data.medalsPerGame) : total.normal * data.costPerGame;
    const cashProfit = total.payout * data.exchange - investment;
    const profit = heldMedals > 0 ? cashProfit + total.held * Math.max(0, exchangeGap) : cashProfit;
    const games = total.normal + (data.junzou > 0 ? total.payout / data.junzou : 0);
    return { g, n: total.n, ev: roundAggregateEV(profit / total.n, data.roundingEpsilon),
      inv: medals / total.n, playG: games / total.n,
      rtp: games > 0 ? 100 + profit / (20 * data.bet * games) * 100 : 100 };
  });
  const first = baseAnchors[0];
  return { baseAnchors, start: first?.g ?? fallbackStart,
    end: baseAnchors.at(-1)?.g ?? fallbackStart,
    hits: first?.n ?? 0, totalPayout: first ? byGame.get(first.g).payout : 0, firstHitRate: null };
}
