import type { MachineSummary } from "./types";

/** Saved raw history is not an EV sample until its counter signals are understood. */
export function collectionPending(meta: MachineSummary["meta"]): boolean {
  return Boolean(meta.collection && Number(meta.samples.replace(/,/g, "")) === 0);
}

export function collectionStatus(meta: MachineSummary["meta"]): string | null {
  if (!collectionPending(meta)) return null;
  return `収集済み ${meta.collection!.rows.toLocaleString("ja-JP")}行 / 期待値算出保留`;
}
