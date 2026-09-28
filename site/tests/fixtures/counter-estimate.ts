import type { CounterEstimate } from "../../lib/ev/types";
import { COUNTER_ESTIMATE_LABEL } from "../../lib/ev/counter-estimate";

/** Tiny synthetic estimate; independent of collected histories. */
export function estimateFixture(): CounterEstimate {
  const rates = (rows: number) => (["46/52", "50/50"] as const).map(key => ({
    key, label: key, loanPerMedal: key === "46/52" ? 1000 / 46 : 20, creditPerMedal: key === "46/52" ? 1000 / 52 : 20,
    anchors: Array.from({ length: rows }, (_, i) => ({ g: i * 10, n: 50 - i, ev: -100 + i * 40, rtp: 99 + i, inv: 300 - i * 10, playG: 250 - i * 5 })),
  }));
  return {
    schemaVersion: 1, status: "estimate", model: "lycoris-counter-v1", label: COUNTER_ESTIMATE_LABEL,
    historyBased: true, graphCorrected: false,
    note: "架空の履歴から計算した推定です。獲得枚数は推定です。",
    assumptions: ["信号の解釈を仮定", "ボーナスの区切りを仮定", "AT終了時の差し引きを仮定", "獲得単価を逆算", "当選後終了を仮定"],
    summary: { unitDays: 3, firstDate: "2026-09-01", lastDate: "2026-09-03", excludedDates: ["2026-09-02"],
      assumedAverageSetting: 2, assumedRtp: 98.9, firstHitGames: 320, meanPayout: 500, normalBonus: 120, upperBonus: 160,
      kakeShare: 0.4, normalShare: 0.5, upperShare: 0.1 },
    groups: [
      { key: "all", label: "全体（朝一除く）", rates: rates(3) },
      { key: "after_kake", label: "前回 駆け抜け", rates: rates(2) },
      { key: "after_normal", label: "前回 通常AT", rates: rates(2) },
      { key: "after_upper", label: "前回 上位AT", rates: rates(0) },
    ],
  };
}
