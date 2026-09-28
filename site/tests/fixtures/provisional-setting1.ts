import type { ProvisionalSetting1 } from "../../lib/ev/types";
import { PROVISIONAL_SETTING1_LABEL } from "../../lib/ev/provisional-setting1";

/** Tiny synthetic model; tests are independent of collected histories and live specs. */
export function referenceFixture(machineId?: "lycoris" | "worlddai"): ProvisionalSetting1 {
  const ceiling = machineId === "lycoris" ? 850 : machineId === "worlddai" ? 999 : 100;
  let probability = 0.1;
  const remaining = (games: number) => -Math.expm1(games * Math.log1p(-probability)) / probability;
  const mean = machineId === "lycoris" ? 328.8 : machineId === "worlddai" ? 306.5 : remaining(ceiling);
  if (machineId) {
    let low = 0, high = 1;
    for (let i = 0; i < 90; i++) {
      probability = (low + high) / 2;
      if (remaining(ceiling) > mean) low = probability;
      else high = probability;
    }
    probability = (low + high) / 2;
  }
  const use = machineId === "lycoris" ? 50 / 31.8 : machineId === "worlddai" ? 50 / 30 : 1.5;
  const net = machineId === "lycoris" ? 8.4 : machineId === "worlddai" ? 8 : 4;
  const rtp = machineId === "lycoris" ? 0.979 : machineId === "worlddai" ? 0.978 : 0.97;
  const payout = mean * (use + 3 * (rtp - 1)) / (1 - 3 * (rtp - 1) / net);
  return {
    schemaVersion: 1, status: "provisional", model: "capped-geometric-v1",
    label: PROVISIONAL_SETTING1_LABEL, graphCorrected: false, historyBased: false,
    note: "実戦の期待値ではありません。公表設定1を基準にした仮定モデルです。グラフ補正は未実施です。",
    sources: [{ label: "架空の仕様資料", url: "https://example.test/spec" }],
    assumptions: ["平均待ちGを仮定", "一定確率を仮定", "公称天井で必ず当選", "天井の+αを省略", "純獲得を一定と仮定", "当選後終了を仮定"],
    publicInputs: { firstHitMeanGames: mean, setting1Rtp: rtp, medalsPerGame: use, bonusNetMedalsPerGame: net, nominalCeilingGames: ceiling },
    modelInputs: { bet: 3, normalHitProbability: probability, assumedFixedPayout: payout },
    rates: ([['46/52', 1000 / 46, 1000 / 52], ['50/50', 20, 20]] as const).map(([key, loan, credit]) => ({
      key, label: key, loanPerMedal: loan, creditPerMedal: credit,
      anchors: Array.from({ length: Math.ceil(ceiling / 10) }, (_, index) => {
        const g = index * 10, normal = remaining(ceiling - g), inv = normal * use, playG = normal + payout / net;
        const profit = payout * credit - inv * loan, ev = Math.round(profit);
        const rounded = Math.round((100 + profit / (60 * playG) * 100) * 10) / 10;
        return { g, ev, rtp: ev >= 0 ? Math.max(100, rounded) : Math.min(99.9, rounded), inv: Number(inv.toFixed(6)), playG: Number(playG.toFixed(6)) };
      })
    }))
  };
}
