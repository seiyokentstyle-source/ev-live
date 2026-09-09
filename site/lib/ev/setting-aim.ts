type SummaryRow = { net: number; games?: number | null };

/** 表示中の集計モードと同じ台を使ってフッターの合計を出す。 */
export function settingAimTotals(
  view: "date" | "day",
  dateRows: SummaryRow[],
  dayRows: SummaryRow[]
): { net: number; games: number } {
  const visibleRows = view === "day" ? dayRows : dateRows;
  return visibleRows.reduce<{ net: number; games: number }>(
    (totals, row) => ({ net: totals.net + row.net, games: totals.games + (row.games ?? 0) }),
    { net: 0, games: 0 }
  );
}
