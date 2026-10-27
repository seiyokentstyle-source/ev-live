import { KATANA_COLORS, KATANA_DISPLAY_POINTS, type KatanaEstimate } from "../../lib/ev/katana-estimate";

/** Synthetic display values. No observed receipts or external financial table is adopted by this fixture. */
export function katanaEstimateFixture(): KatanaEstimate {
  return {
    schemaVersion: 1,
    modelVersion: "izaban-katana-conditional-inverse-v1",
    classification: "setting-unadjusted-proxy",
    status: "ready",
    ready: true,
    source: {
      machineName: "いざ！番長", hallId: "shinjuku", periodStart: "2026-09-01", periodEnd: "2026-09-03",
      cohortCondition: "normal-main; 50 <= firstHitGame % 100 <= 99", stopPolicy: "first-at-end-no-pullback",
    },
    sample: { count: 2, totalPayout: 600, meanPayout: 300, meanAtGames: 100 },
    economics: { costPerGame: 1.5, netPayoutPerAtGame: 3, bet: 3, medalYen: 20, gamesPerHour: 800 },
    calibration: {
      schemaVersion: 1, modelVersion: "izaban-katana-conditional-inverse-v1",
      source: {
        url: "https://example.com/synthetic-katana-source", articleVersion: "合成テスト版",
        viewedAt: "2026-09-04T09:00+09:00", conditions: "合成データ。設定1・等価、全54条件の形だけを再現。",
      },
      inverseEconomics: { costPerGame: 1.5625, netPayoutPerAtGame: 3, conditionalAtRewardScale: 577.08, medalYen: 20, bet: 3 },
      inverseMethod: "外部校正の意味を保持する合成メタデータ。数値を再計算しない。",
      limitations: ["実機の実測値ではない合成フィクスチャ。"], sha256: "a".repeat(64),
    },
    quality: {
      missingPayoutSignalCount: null, normalization: "existing-zero",
      note: "未観測獲得の件数と金額影響は未確定。合成データの表示確認用。",
    },
    notes: ["設定未調整の参考試算。", "最初のAT終了まで。", "信号解釈による代理集計。", "外部表からの条件付き逆算。", "20円等価・800G/時。"],
    rows: [false, true].flatMap(highState => KATANA_COLORS.flatMap((color, colorIndex) =>
      KATANA_DISPLAY_POINTS.map((displayPt, pointIndex) => ({
        highState, color, displayPt, nonAtGames: 100 - pointIndex, effectiveAtRate: 0.2 + colorIndex * 0.1,
        evYen: -200 + pointIndex * 50 + colorIndex * 100 + (highState ? 10 : 0),
        rtpPct: 95 + pointIndex + colorIndex, totalGames: 150 - pointIndex,
        hourlyYen: -1000 + pointIndex * 200 + colorIndex * 100 + (highState ? 20 : 0),
      })))),
    sourceRevision: "b".repeat(64),
  };
}

export function unavailableKatanaEstimateFixture(): KatanaEstimate {
  const ready = katanaEstimateFixture();
  return {
    ...ready, status: "unavailable", ready: false,
    sample: { count: 0, totalPayout: 0, meanPayout: null, meanAtGames: null }, rows: [],
    sourceRevision: "c".repeat(64),
  };
}
