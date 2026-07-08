"use client";

import { useMemo, useState } from "react";
import type { Harakiri } from "@/lib/ev/types";

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

export function HarakiriTable({ harakiri }: HarakiriTableProps) {
  // 期待値表と同様にコピーを軽く抑止（選択/コピー/右クリックを無効化）。
  const blockEvent = (event: { preventDefault: () => void }) => event.preventDefault();

  const [tailFilter, setTailFilter] = useState<string | null>(null);

  const tailOptions = useMemo(
    () => Array.from(new Set(harakiri.units.map((u) => tailOf(u.unit)))).filter(Boolean).sort(),
    [harakiri.units]
  );

  const rows = useMemo(
    () => harakiri.units.filter((u) => tailFilter === null || tailOf(u.unit) === tailFilter),
    [harakiri.units, tailFilter]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <p className="shrink-0 border-b border-line bg-panel-2 px-3 py-2 text-[10px] leading-relaxed text-muted">
        {harakiri.note}
      </p>
      <div className="shrink-0 border-b border-line bg-panel px-3 py-2">
        <label className="flex items-center gap-2">
          <span className="mono w-12 shrink-0 text-[9px] tracking-[0.08em] text-muted">末尾</span>
          <select
            value={tailFilter ?? ""}
            onChange={(e) => setTailFilter(e.target.value === "" ? null : e.target.value)}
            className="mono rounded border border-line bg-panel-2 px-2 py-1 text-[11px] text-ink-soft [color-scheme:dark]"
          >
            <option value="">全部</option>
            {tailOptions.map((v) => (
              <option key={v} value={v}>
                末尾{v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className="min-h-0 flex-1 select-none overflow-auto [-webkit-touch-callout:none]"
        onCopy={blockEvent}
        onCut={blockEvent}
        onContextMenu={blockEvent}
      >
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">該当する台がありません</p>
        ) : (
          <table className="mono w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 border-b-2 border-r border-line bg-panel-2 px-3 py-2 text-left text-[10px] text-ink-soft">
                  台番号
                </th>
                <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-highlight">
                  ハラキリ率
                  <span className="block text-[9px] text-muted">%（推定）</span>
                </th>
                <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                  発生
                  <span className="block text-[9px] text-muted">回</span>
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
              {rows.map((unit, index) => {
                const alt = index % 2 === 1 ? "bg-[var(--row-alt)]" : "";
                return (
                  <tr key={unit.unit}>
                    <td className="sticky left-0 z-10 border-b border-r border-line-soft bg-panel px-3 py-2 text-left font-bold text-ink-soft">
                      {unit.unit}
                    </td>
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right font-bold ${rateToneClass(unit.rate, unit.rush)} ${alt}`}>
                      {unit.rush === 0 ? "—" : unit.rate.toFixed(1)}
                    </td>
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-ink-soft ${alt}`}>
                      {unit.hits}
                    </td>
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-muted ${alt}`}>
                      {unit.rush}
                    </td>
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-muted ${alt}`}>
                      {unit.sessions}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-line bg-panel-2 px-3 py-2 text-[11px]">
        <span className="mono text-muted">
          {rows.length}台 / しきい値 {harakiri.threshold}枚
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
