"use client";

import { useMemo, useState } from "react";
import type { Harakiri } from "@/lib/ev/types";
import { MonthTabs, monthOf } from "./MonthTabs";

type HarakiriTableProps = {
  harakiri: Harakiri;
};

function tailOf(unit: string): string {
  const digits = unit.replace(/\D/g, "");
  return digits.length > 0 ? digits.slice(-1) : "";
}

// 率の強弱で色を付ける（全体率との比較ではなく絶対値の目安）。
function rateToneClass(rate: number, rush: number): string {
  if (rush === 0) return "text-muted";
  if (rate >= 20) return "text-pos";
  if (rate >= 10) return "text-ink-soft";
  return "text-neg";
}

function shortDate(date: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${Number(m[1])}/${Number(m[2])}` : date;
}

type HarakiriView = "unit" | "date";

export function HarakiriTable({ harakiri }: HarakiriTableProps) {
  // 期待値表と同様にコピーを軽く抑止（選択/コピー/右クリックを無効化）。
  const blockEvent = (event: { preventDefault: () => void }) => event.preventDefault();

  const [view, setView] = useState<HarakiriView>("unit");
  const [tailFilter, setTailFilter] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<string | null>(null); // 月タブ（日付別のみ）
  const hasByDate = Boolean(harakiri.byDate && harakiri.byDate.length > 0);
  const allDates = useMemo(() => (harakiri.byDate ?? []).map((d) => d.date), [harakiri.byDate]);

  const tailOptions = useMemo(
    () => Array.from(new Set(harakiri.units.map((u) => tailOf(u.unit)))).filter(Boolean).sort(),
    [harakiri.units]
  );

  const rows = useMemo(
    () => harakiri.units.filter((u) => tailFilter === null || tailOf(u.unit) === tailFilter),
    [harakiri.units, tailFilter]
  );
  const dateRows = useMemo(
    () => (harakiri.byDate ?? []).filter((d) => monthFilter === null || monthOf(d.date) === monthFilter),
    [harakiri.byDate, monthFilter]
  );
  const empty = view === "date" ? dateRows.length === 0 : rows.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <p className="shrink-0 border-b border-line bg-panel-2 px-3 py-2 text-[10px] leading-relaxed text-muted">
        {harakiri.note}
      </p>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-3 py-2">
        {hasByDate ? (
          <div className="flex overflow-hidden rounded border border-line">
            <button
              type="button"
              onClick={() => setView("unit")}
              className={`mono px-3 py-1 text-[11px] ${view === "unit" ? "bg-panel-2 text-highlight" : "text-muted"}`}
            >
              台番号別
            </button>
            <button
              type="button"
              onClick={() => setView("date")}
              className={`mono border-l border-line px-3 py-1 text-[11px] ${view === "date" ? "bg-panel-2 text-highlight" : "text-muted"}`}
            >
              日付別
            </button>
          </div>
        ) : null}
        {view === "unit" ? (
          <label className="flex items-center gap-2">
            <span className="mono w-12 shrink-0 text-[9px] tracking-[0.08em] text-muted">末尾</span>
            <select
              value={tailFilter ?? ""}
              onChange={(e) => setTailFilter(e.target.value === "" ? null : e.target.value)}
              className="mono w-[128px] rounded border border-line bg-panel-2 px-2 py-1 text-[11px] text-ink-soft [color-scheme:dark]"
            >
              <option value="">全部</option>
              {tailOptions.map((v) => (
                <option key={v} value={v}>
                  末尾{v}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {view === "date" && hasByDate ? (
        <div className="shrink-0 border-b border-line bg-panel px-3 py-2">
          <MonthTabs dates={allDates} value={monthFilter} onChange={setMonthFilter} />
        </div>
      ) : null}
      <div
        className="min-h-0 flex-1 select-none overflow-auto [-webkit-touch-callout:none]"
        onCopy={blockEvent}
        onCut={blockEvent}
        onContextMenu={blockEvent}
      >
        {empty ? (
          <p className="px-3 py-6 text-center text-xs text-muted">
            {view === "date" ? "日付別データがありません" : "該当する台がありません"}
          </p>
        ) : (
          <table className="mono w-full table-fixed border-separate border-spacing-0 text-xs">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[24%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 whitespace-nowrap border-b-2 border-r border-line bg-panel-2 px-3 py-2 text-left text-[10px] text-ink-soft">
                  {view === "date" ? "日付" : "台番号"}
                </th>
                <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-highlight">
                  ドライブ発生率
                  <span className="block text-[9px] text-muted">%（推定・最大100）</span>
                </th>
                <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                  発生
                  <span className="block text-[9px] text-muted">ラッシュ</span>
                </th>
                <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                  ラッシュ
                  <span className="block text-[9px] text-muted">回</span>
                </th>
                <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                  初当り
                  <span className="block text-[9px] text-muted">回</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view === "date"
                ? dateRows.map((d, index) => {
                    const alt = index % 2 === 1 ? "bg-[var(--row-alt)]" : "";
                    return (
                      <tr key={d.date}>
                        <td className="sticky left-0 z-10 border-b border-r border-line-soft bg-panel px-3 py-2 text-left font-bold text-ink-soft">
                          {shortDate(d.date)}
                        </td>
                        <td className={`border-b border-r border-line-soft px-2 py-2 text-right font-bold ${rateToneClass(d.rate, d.rush)} ${alt}`}>
                          {d.rush === 0 ? "—" : d.rate.toFixed(1)}
                        </td>
                        <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-ink-soft ${alt}`}>{d.hits}</td>
                        <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-muted ${alt}`}>{d.rush}</td>
                        <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-muted ${alt}`}>{d.sessions}</td>
                      </tr>
                    );
                  })
                : rows.map((unit, index) => {
                    const alt = index % 2 === 1 ? "bg-[var(--row-alt)]" : "";
                    return (
                      <tr key={unit.unit}>
                        <td className="sticky left-0 z-10 border-b border-r border-line-soft bg-panel px-3 py-2 text-left font-bold text-ink-soft">
                          {unit.unit}
                        </td>
                        <td className={`border-b border-r border-line-soft px-2 py-2 text-right font-bold ${rateToneClass(unit.rate, unit.rush)} ${alt}`}>
                          {unit.rush === 0 ? "—" : unit.rate.toFixed(1)}
                        </td>
                        <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-ink-soft ${alt}`}>{unit.hits}</td>
                        <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-muted ${alt}`}>{unit.rush}</td>
                        <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-muted ${alt}`}>{unit.sessions}</td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-line bg-panel-2 px-3 py-2 text-[11px]">
        <span className="mono text-muted">
          {view === "date" ? `${dateRows.length}日` : `${rows.length}台`} / しきい値 {harakiri.threshold}枚
        </span>
        <span className="mono text-ink-soft">
          機種全体
          <span className="ml-2 font-bold text-highlight">{harakiri.total.rate.toFixed(1)}%</span>
          <span className="ml-1 text-muted">
            （{harakiri.total.hits}回/{harakiri.total.rush}ラッシュ）
          </span>
        </span>
      </div>
    </div>
  );
}
