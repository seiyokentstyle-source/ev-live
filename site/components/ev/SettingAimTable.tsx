"use client";

import { useMemo, useState } from "react";
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

function tailOf(unit: string): string {
  const digits = unit.replace(/\D/g, "");
  return digits.length > 0 ? digits.slice(-1) : "";
}

// 日にち（DD部分）の数字。"2026-06-10"→"10"。"1のつく日"の判定に使う。
function dayOfMonth(date: string): string {
  const m = /^\d{4}-\d{2}-(\d{2})$/.exec(date);
  return m ? String(Number(m[1])) : "";
}

function FilterSelect({
  label,
  allLabel,
  options,
  value,
  onChange,
  fmt
}: {
  label: string;
  allLabel: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
  fmt: (v: string) => string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="mono w-12 shrink-0 text-[9px] tracking-[0.08em] text-muted">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="mono rounded border border-line bg-panel-2 px-2 py-1 text-[11px] text-ink-soft [color-scheme:dark]"
      >
        <option value="">{allLabel}</option>
        {options.map((v) => (
          <option key={v} value={v}>
            {fmt(v)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SettingAimTable({ aim }: SettingAimTableProps) {
  // 期待値表と同様にコピーを軽く抑止（選択/コピー/右クリックを無効化）。
  const blockEvent = (event: { preventDefault: () => void }) => event.preventDefault();

  const [tailFilter, setTailFilter] = useState<string | null>(null); // 台番号末尾
  const [dayDigit, setDayDigit] = useState<string | null>(null); // 日にちに含まれる数字（○のつく日）

  // 絞り込み候補（データに実在する値だけ出す）
  const tailOptions = useMemo(
    () => Array.from(new Set(aim.units.map((u) => tailOf(u.unit)))).filter(Boolean).sort(),
    [aim.units]
  );
  const dayOptions = useMemo(
    () => Array.from(new Set(aim.dates.flatMap((d) => dayOfMonth(d).split("")))).sort(),
    [aim.dates]
  );

  // 表示する日付列（○のつく日で絞り込み）
  const visibleDateIdx = useMemo(
    () => aim.dates.map((_, i) => i).filter((i) => dayDigit === null || dayOfMonth(aim.dates[i]).includes(dayDigit)),
    [aim.dates, dayDigit]
  );

  // 台番号末尾で行を絞り、表示中の日付だけで平均・日数を再計算（欠損だけの台は隠す）
  const rows = useMemo(() => {
    return aim.units
      .filter((u) => tailFilter === null || tailOf(u.unit) === tailFilter)
      .map((u) => {
        const visRates = visibleDateIdx.map((i) => u.rates[i]);
        const present = visRates.filter((r): r is number => r !== null);
        const avg = present.length ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10 : null;
        return { unit: u.unit, net: u.net, avg, days: present.length, visRates };
      })
      .filter((u) => u.days > 0)
      .sort((a, b) => (b.avg ?? -Infinity) - (a.avg ?? -Infinity));
  }, [aim.units, tailFilter, visibleDateIdx]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <p className="shrink-0 border-b border-line bg-panel-2 px-3 py-2 text-[10px] leading-relaxed text-muted">
        {aim.note}
      </p>
      <div className="shrink-0 space-y-2 border-b border-line bg-panel px-3 py-2">
        <FilterSelect
          label="末尾"
          allLabel="全部"
          options={tailOptions}
          value={tailFilter}
          onChange={setTailFilter}
          fmt={(v) => `末尾${v}`}
        />
        <FilterSelect
          label="つく日"
          allLabel="全日"
          options={dayOptions}
          value={dayDigit}
          onChange={setDayDigit}
          fmt={(v) => `${v}のつく日`}
        />
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
                  平均
                  <span className="block text-[9px] text-muted">出率%</span>
                </th>
                <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                  日数
                  <span className="block text-[9px] text-muted">日</span>
                </th>
                {visibleDateIdx.map((i) => (
                  <th
                    key={aim.dates[i]}
                    className="sticky top-0 z-20 whitespace-nowrap border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft"
                  >
                    {shortDate(aim.dates[i])}
                    <span className="block text-[9px] text-muted">%</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((unit, index) => {
                const alt = index % 2 === 1 ? "bg-[var(--row-alt)]" : "";
                return (
                  <tr key={unit.unit}>
                    <td className="sticky left-0 z-10 border-b border-r border-line-soft bg-panel px-3 py-2 text-left font-bold text-ink-soft">
                      {unit.unit}
                      <span className="block text-[9px] font-normal text-muted">{formatSigned(unit.net)}枚</span>
                    </td>
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right font-bold ${unit.avg === null ? "text-muted" : rtpToneClass(unit.avg)} ${alt}`}>
                      {unit.avg === null ? "—" : unit.avg.toFixed(1)}
                    </td>
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-muted ${alt}`}>
                      {unit.days}
                    </td>
                    {unit.visRates.map((rate, i) => (
                      <td
                        key={aim.dates[visibleDateIdx[i]]}
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
        )}
      </div>
    </div>
  );
}
