"use client";

import { useMemo } from "react";
import type { AtPayout } from "@/lib/ev/types";

type AtPayoutTableProps = {
  data: AtPayout;
};

export function AtPayoutTable({ data }: AtPayoutTableProps) {
  // 期待値表と同様にコピーを軽く抑止。
  const blockEvent = (event: { preventDefault: () => void }) => event.preventDefault();

  const totals = useMemo(() => {
    const count = data.bands.reduce((sum, b) => sum + b.count, 0);
    const mean = count
      ? Math.round((data.bands.reduce((sum, b) => sum + b.mean * b.count, 0) / count) * 10) / 10
      : 0;
    return { count, mean };
  }, [data.bands]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <p className="shrink-0 border-b border-line bg-panel-2 px-3 py-2 text-[10px] leading-relaxed text-muted">
        {data.note}
      </p>
      <div
        className="min-h-0 flex-1 select-none overflow-auto [-webkit-touch-callout:none]"
        onCopy={blockEvent}
        onCut={blockEvent}
        onContextMenu={blockEvent}
      >
        <table className="mono w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 border-b-2 border-r border-line bg-panel-2 px-3 py-2 text-left text-[10px] text-ink-soft">
                当選G
                <span className="block text-[9px] text-muted">ハマりG</span>
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-highlight">
                平均獲得
                <span className="block text-[9px] text-muted">枚</span>
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                中央値
                <span className="block text-[9px] text-muted">枚</span>
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                サンプル
                <span className="block text-[9px] text-muted">件</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.bands.map((band, index) => {
              const alt = index % 2 === 1 ? "bg-[var(--row-alt)]" : "";
              return (
                <tr key={band.lo}>
                  <td className="sticky left-0 z-10 border-b border-r border-line-soft bg-panel px-3 py-2 text-left font-bold text-ink-soft">
                    {band.lo}–{band.hi - 1}
                  </td>
                  <td className={`border-b border-r border-line-soft px-2 py-2 text-right font-bold text-pos ${alt}`}>
                    {band.mean.toLocaleString("ja-JP")}
                  </td>
                  <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-ink-soft ${alt}`}>
                    {band.median.toLocaleString("ja-JP")}
                  </td>
                  <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-muted ${alt}`}>
                    {band.count.toLocaleString("ja-JP")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-line bg-panel-2 px-3 py-2 text-[11px]">
        <span className="mono text-muted">全{totals.count.toLocaleString("ja-JP")}AT</span>
        <span className="mono text-ink-soft">
          平均獲得
          <span className="ml-2 font-bold text-pos">{totals.mean.toLocaleString("ja-JP")}枚</span>
        </span>
      </div>
    </div>
  );
}
