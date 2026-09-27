import type { CollectedMachine } from "../../lib/collection-status-contract";

export function collectedFixture(id = "held"): CollectedMachine {
  return {
    summary: { id, name: "保留機種", manufacturer: "メーカー", aliases: ["保留機種", "held"],
      releaseDate: "2026-01-01", lastUpdated: "2026-09-26", available: true, thumb: null,
      meta: { samples: "0", source: "保存済み履歴／期待値算出保留",
        collection: { rows: 1200, events: 1100, units: 2, days: 3, firstDate: "2026-09-23", lastDate: "2026-09-26" } } },
    pendingReason: "当たり信号と獲得枚数の対応を確認中です。",
    reasonCode: "signal_unverified", collectionComplete: true, expectedUnits: 2,
  };
}

export function catalogFixture(id = "held", forcePending = false) {
  const { summary, ...pending } = collectedFixture(id);
  const { available: _, thumb: _thumb, meta, ...identity } = summary;
  return { schema: "evlive-collection-status/v1", source: "daidata", storeId: "100949", hallId: "kabuki",
    lastUpdated: summary.lastUpdated,
    machines: [{ ...identity, ...pending, collection: meta.collection!, status: "pending", forcePending,
      sourceIntegrity: { schemaVersion: 1, hallId: "kabuki", machineName: summary.name,
        targetDate: summary.lastUpdated, inputSha256: "a".repeat(64) } }] };
}
