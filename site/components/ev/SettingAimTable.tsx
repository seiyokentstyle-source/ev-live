"use client";

import { useMemo, useState } from "react";
import type { SettingAim, SettingAimUnit } from "@/lib/ev/types";
import { formatSigned, rtpToneClass } from "./format";

type SettingAimTableProps = {
  aim: SettingAim;
};

// "avg" = 平均出率 / "tail" = 台番号末尾 / "date" = 特定日の出率（dateIndex の日）
type SortKey = "avg" | "tail" | "date";
type SortState = { key: SortKey; dateIndex: number; dir: "asc" | "desc" };

function shortDate(date: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${Number(match[1])}/${Number(match[2])}` : date;
}

function rateCell(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}`;
}

function tailOf(unit: string): number {
  const digits = unit.replace(/\D/g, "");
  return digits.length > 0 ? Number(digits.slice(-1)) : 0;
}

function sortUnits(units: SettingAimUnit[], sort: SortState): SettingAimUnit[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...units].sort((a, b) => {
    if (sort.key === "tail") {
      const ta = tailOf(a.unit);
      const tb = tailOf(b.unit);
      if (ta !== tb) return (ta - tb) * sign;
      return Number(a.unit) - Number(b.unit); // 同じ末尾は台番号昇順で安定
    }
    if (sort.key === "date") {
      const ra = a.rates[sort.dateIndex];
      const rb = b.rates[sort.dateIndex];
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1; // 欠損日は常に末尾
      if (rb === null) return -1;
      return (ra - rb) * sign;
    }
    return (a.avg - b.avg) * sign;
  });
}

export function SettingAimTable({ aim }: SettingAimTableProps) {
  // 期待値表と同様にコピーを軽く抑止（選択/コピー/右クリックを無効化）。
  const blockEvent = (event: { preventDefault: () => void }) => event.preventDefault();

  const [sort, setSort] = useState<SortState>({ key: "avg", dateIndex: -1, dir: "desc" });

  function toggleSort(key: SortKey, dateIndex: number, defaultDir: "asc" | "desc"): void {
    setSort((prev) => {
      const same = prev.key === key && prev.dateIndex === dateIndex;
      return { key, dateIndex, dir: same ? (prev.dir === "asc" ? "desc" : "asc") : defaultDir };
    });
  }

  const sortedUnits = useMemo(() => sortUnits(aim.units, sort), [aim.units, sort]);

  function arrow(key: SortKey, dateIndex: number): string {
    if (sort.key !== key || sort.dateIndex !== dateIndex) return "";
    return sort.dir === "asc" ? " ▲" : " ▼";
  }
  function activeClass(key: SortKey, dateIndex: number): string {
    return sort.key === key && sort.dateIndex === dateIndex ? "text-highlight" : "";
  }

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
              <th
                onClick={() => toggleSort("tail", -1, "asc")}
                className={`sticky left-0 top-0 z-30 cursor-pointer border-b-2 border-r border-line bg-panel-2 px-3 py-2 text-left text-[10px] text-ink-soft ${activeClass("tail", -1)}`}
              >
                台番号
                <span className="block text-[9px] text-muted">末尾順{arrow("tail", -1)}</span>
              </th>
              <th
                onClick={() => toggleSort("avg", -1, "desc")}
                className={`sticky top-0 z-20 cursor-pointer border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] ${sort.key === "avg" ? "text-highlight" : "text-highlight/70"}`}
              >
                平均{arrow("avg", -1)}
                <span className="block text-[9px] text-muted">出率%</span>
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                日数
                <span className="block text-[9px] text-muted">日</span>
              </th>
              {aim.dates.map((date, i) => (
                <th
                  key={date}
                  onClick={() => toggleSort("date", i, "desc")}
                  className={`sticky top-0 z-20 cursor-pointer whitespace-nowrap border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft ${activeClass("date", i)}`}
                >
                  {shortDate(date)}
                  {arrow("date", i)}
                  <span className="block text-[9px] text-muted">%</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedUnits.map((unit, index) => {
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
