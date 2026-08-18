"use client";

import { useMemo } from "react";
import type { Theoretical } from "@/lib/ev/types";
import { formatSigned, rtpToneClass, toneClass } from "./format";

type TheoreticalTableProps = {
  data: Theoretical;
  /** 時給換算に使う（economics.gamesPerHour）. */
  gamesPerHour: number;
};

export function TheoreticalTable({ data, gamesPerHour }: TheoreticalTableProps) {
  const blockEvent = (event: { preventDefault: () => void }) => event.preventDefault();

  // 行間隔はデータ側の gRange.step に従う（生成側が10G刻みなら10G刻みで全部出す）。
  // 最終行（天井手前の最深G）は step で割り切れなくても必ず残す。
  const rows = useMemo(() => {
    const step = Math.max(1, data.gRange?.step ?? 10);
    const last = data.baseAnchors[data.baseAnchors.length - 1];
    return data.baseAnchors.filter((a) => a.g % step === 0 || a.g === last?.g);
  }, [data.baseAnchors, data.gRange]);

  // 期待値がプラスに転じる最初のG＝天井狙いのボーダー。
  const border = useMemo(() => data.baseAnchors.find((a) => a.ev >= 0)?.g ?? null, [data.baseAnchors]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <p className="shrink-0 border-b border-line bg-panel-2 px-3 py-2 text-[10px] leading-relaxed text-muted">
        {data.note}
      </p>
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-panel px-3 py-2 text-[11px]">
        <span className="mono text-muted">
          ボーダー
          <span className="ml-2 font-bold text-highlight">
            {border === null ? "—" : `${border.toLocaleString("ja-JP")}G〜`}
          </span>
        </span>
        <span className="mono text-muted">
          初当り 1/{data.firstHitG.toLocaleString("ja-JP")} ／ 平均獲得 {data.avgPayout.toLocaleString("ja-JP")}枚
        </span>
      </div>
      <div
        className="min-h-0 flex-1 select-none overflow-auto [-webkit-touch-callout:none]"
        onCopy={blockEvent}
        onCut={blockEvent}
        onContextMenu={blockEvent}
      >
        <table className="mono w-full table-fixed border-separate border-spacing-0 text-xs">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[22%]" />
            <col className="w-[20%]" />
            <col className="w-[20%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 whitespace-nowrap border-b-2 border-r border-line bg-panel-2 px-3 py-2 text-left text-[10px] text-ink-soft">
                G数
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-highlight">
                期待値
                <span className="block text-[9px] text-muted">円</span>
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                機械割
                <span className="block text-[9px] text-muted">%</span>
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                時給
                <span className="block text-[9px] text-muted">円/h</span>
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                平均投入
                <span className="block text-[9px] text-muted">枚</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, index) => {
              const alt = index % 2 === 1 ? "bg-[var(--row-alt)]" : "";
              const hourly = a.playG ? Math.round((a.ev * gamesPerHour) / a.playG) : 0;
              return (
                <tr key={a.g}>
                  <td className="sticky left-0 z-10 border-b border-r border-line-soft bg-panel px-3 py-2 text-left font-bold text-ink-soft">
                    {a.g.toLocaleString("ja-JP")}
                  </td>
                  <td className={`border-b border-r border-line-soft px-2 py-2 text-right font-bold ${toneClass(a.ev)} ${alt}`}>
                    {formatSigned(a.ev)}
                  </td>
                  <td className={`border-b border-r border-line-soft px-2 py-2 text-right ${rtpToneClass(a.rtp)} ${alt}`}>
                    {a.rtp.toFixed(1)}
                  </td>
                  <td className={`border-b border-r border-line-soft px-2 py-2 text-right ${toneClass(hourly)} ${alt}`}>
                    {formatSigned(hourly)}
                  </td>
                  <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-muted ${alt}`}>
                    {a.inv?.toLocaleString("ja-JP") ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-line bg-panel-2 px-3 py-2 text-[11px]">
        <span className="mono text-muted">{data.label}</span>
        <span className="mono truncate pl-2 text-ink-soft">{data.source}</span>
      </div>
    </div>
  );
}
