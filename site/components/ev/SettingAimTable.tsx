"use client";

import type { SettingAim } from "@/lib/ev/types";
import { formatSigned, rtpToneClass } from "./format";

type SettingAimTableProps = {
  aim: SettingAim;
};

function shortDate(date: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${Number(match[1])}/${Number(match[2])}` : date;
}

function rateCell(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}`;
}

export function SettingAimTable({ aim }: SettingAimTableProps) {
  // 期待値表と同様にコピーを軽く抑止（選択/コピー/右クリックを無効化）。
  const blockEvent = (event: { preventDefault: () => void }) => event.preventDefault();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <p className="shrink-0 border-b border-line bg-panel-2 px-3 py-2 text-[10px] leading-relaxed text-muted">
        {aim.note}
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
                台番号
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-highlight">
                平均
                <span className="block text-[9px] text-muted">出率%</span>
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                日数
                <span className="block text-[9px] text-muted">日</span>
              </th>
              {aim.dates.map((date) => (
                <th
                  key={date}
                  className="sticky top-0 z-20 whitespace-nowrap border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft"
                >
                  {shortDate(date)}
                  <span className="block text-[9px] text-muted">%</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {aim.units.map((unit, index) => {
              const alt = index % 2 === 1 ? "bg-[var(--row-alt)]" : "";
              return (
                <tr key={unit.unit}>
                  <td className="sticky left-0 z-10 border-b border-r border-line-soft bg-panel px-3 py-2 text-left font-bold text-ink-soft">
                    {unit.unit}
                    <span className="block text-[9px] font-normal text-muted">{formatSigned(unit.net)}枚</span>
                  </td>
                  <td className={`border-b border-r border-line-soft px-2 py-2 text-right font-bold ${rtpToneClass(unit.avg)} ${alt}`}>
                    {unit.avg.toFixed(1)}
                  </td>
                  <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-muted ${alt}`}>
                    {unit.days}
                  </td>
                  {unit.rates.map((rate, i) => (
                    <td
                      key={aim.dates[i]}
                      className={`border-b border-r border-line-soft px-2 py-2 text-right ${
                        rate === null ? "text-muted" : rtpToneClass(rate)
                      } ${alt}`}
                    >
                      {rateCell(rate)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
