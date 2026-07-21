"use client";

import { useMemo, useState } from "react";
import type { SettingAim } from "@/lib/ev/types";
import { formatSigned, rtpToneClass, toneClass } from "./format";
import { MonthTabs, monthOf } from "./MonthTabs";

type SettingAimTableProps = {
  aim: SettingAim;
};

type AimView = "date" | "day";

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

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// 母標準偏差（出率のブレ。小さいほど安定＝設定変動が少ない）。
function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  return Math.round(Math.sqrt(mean(values.map((v) => (v - m) ** 2))) * 10) / 10;
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
        className="mono w-[128px] rounded border border-line bg-panel-2 px-2 py-1 text-[11px] text-ink-soft [color-scheme:dark]"
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

  const [view, setView] = useState<AimView>("date");
  const [tailFilter, setTailFilter] = useState<string | null>(null); // 台番号末尾
  const [dayDigit, setDayDigit] = useState<string | null>(null); // 日にちに含まれる数字（○のつく日）
  const [monthFilter, setMonthFilter] = useState<string | null>(null); // 月タブ（"MM"）。null=全期間

  // 絞り込み候補（データに実在する値だけ出す）
  const tailOptions = useMemo(
    () => Array.from(new Set(aim.units.map((u) => tailOf(u.unit)))).filter(Boolean).sort(),
    [aim.units]
  );
  const dayOptions = useMemo(
    () => Array.from(new Set(aim.dates.flatMap((d) => dayOfMonth(d).split("")))).sort(),
    [aim.dates]
  );

  // 表示する日付列（月タブ ＋ ○のつく日で絞り込み）
  const visibleDateIdx = useMemo(
    () =>
      aim.dates
        .map((_, i) => i)
        .filter((i) => {
          const date = aim.dates[i];
          if (monthFilter !== null && monthOf(date) !== monthFilter) return false;
          if (dayDigit !== null && !dayOfMonth(date).includes(dayDigit)) return false;
          return true;
        }),
    [aim.dates, dayDigit, monthFilter]
  );

  // 台番号末尾で行を絞り、表示中の日付だけで平均・日数・一貫性を再計算（欠損だけの台は隠す）
  const rows = useMemo(() => {
    return aim.units
      .filter((u) => tailFilter === null || tailOf(u.unit) === tailFilter)
      .map((u) => {
        const visRates = visibleDateIdx.map((i) => u.rates[i]);
        const present = visRates.filter((r): r is number => r !== null);
        const avg = present.length ? Math.round(mean(present) * 10) / 10 : null;
        // 一貫性：100%超えた日数と、出率のブレ（標準偏差）。平均が高く＆ブレ小＝信頼できる高設定。
        const hi100 = present.filter((r) => r >= 100).length;
        const std = stdev(present);
        const games = u.games ? visibleDateIdx.reduce((sum, i) => sum + (u.games?.[i] ?? 0), 0) : null;
        const visGames = visibleDateIdx.map((i) => (u.games ? u.games[i] : null));
        return { unit: u.unit, net: u.net, avg, days: present.length, hi100, std, games, visRates, visGames };
      })
      .filter((u) => u.days > 0)
      .sort((a, b) => (b.avg ?? -Infinity) - (a.avg ?? -Infinity));
  }, [aim.units, tailFilter, visibleDateIdx]);

  // ○のつく日 × 台 のクロス集計：各台が「d のつく日」でどれくらい出しているかの平均出率。
  // 特定日（例7のつく日）に強い台を探す用。1台の同一日は重複カウントしない。
  const crossRows = useMemo(() => {
    return aim.units
      .filter((u) => tailFilter === null || tailOf(u.unit) === tailFilter)
      .map((u) => {
        // 月タブで絞った日付だけを対象にする（選択月のつく日別を見られる）。
        const inMonth = (date: string) => monthFilter === null || monthOf(date) === monthFilter;
        const cells = dayOptions.map((d) => {
          const rs = aim.dates
            .map((date, i) => (inMonth(date) && dayOfMonth(date).includes(d) ? u.rates[i] : null))
            .filter((r): r is number => r !== null);
          return { digit: d, avg: rs.length ? Math.round(mean(rs) * 10) / 10 : null, days: rs.length };
        });
        const allPresent = aim.dates
          .map((date, i) => (inMonth(date) ? u.rates[i] : null))
          .filter((r): r is number => r !== null);
        const avg = allPresent.length ? Math.round(mean(allPresent) * 10) / 10 : null;
        return { unit: u.unit, net: u.net, avg, cells };
      })
      .filter((u) => u.avg !== null)
      .sort((a, b) => (b.avg ?? -Infinity) - (a.avg ?? -Infinity));
  }, [aim.units, aim.dates, tailFilter, dayOptions, monthFilter]);

  // 表示中（絞り込み後）の台の合計。差枚＝即やめ想定の収支＝トータルの獲得枚数。
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({ net: acc.net + r.net, games: acc.games + (r.games ?? 0) }),
        { net: 0, games: 0 }
      ),
    [rows]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <p className="shrink-0 border-b border-line bg-panel-2 px-3 py-2 text-[10px] leading-relaxed text-muted">
        {aim.note}
        {view === "date"
          ? "　※高設定＝出率100%超だった日数、ブレ＝出率の標準偏差（小さいほど安定）。"
          : "　※各セルは「その数字のつく日」の平均出率。特定日に強い台を探す用。"}
      </p>
      <div className="shrink-0 border-b border-line bg-panel px-3 py-2">
        <MonthTabs dates={aim.dates} value={monthFilter} onChange={setMonthFilter} />
      </div>
      <div className="flex shrink-0 items-center border-b border-line bg-panel px-3 py-2">
        <div className="flex overflow-hidden rounded border border-line">
          <button
            type="button"
            onClick={() => setView("date")}
            className={`mono px-3 py-1 text-[11px] ${view === "date" ? "bg-panel-2 text-highlight" : "text-muted"}`}
          >
            日付別
          </button>
          <button
            type="button"
            onClick={() => setView("day")}
            className={`mono border-l border-line px-3 py-1 text-[11px] ${view === "day" ? "bg-panel-2 text-highlight" : "text-muted"}`}
          >
            つく日別
          </button>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-3 py-2">
        <FilterSelect
          label="末尾"
          allLabel="全部"
          options={tailOptions}
          value={tailFilter}
          onChange={setTailFilter}
          fmt={(v) => `末尾${v}`}
        />
        {view === "date" ? (
          <FilterSelect
            label="つく日"
            allLabel="全日"
            options={dayOptions}
            value={dayDigit}
            onChange={setDayDigit}
            fmt={(v) => `${v}のつく日`}
          />
        ) : null}
      </div>
      <div
        className="min-h-0 flex-1 select-none overflow-auto [-webkit-touch-callout:none]"
        onCopy={blockEvent}
        onCut={blockEvent}
        onContextMenu={blockEvent}
      >
        {view === "day" ? (
          crossRows.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted">該当する台がありません</p>
          ) : (
            <table className="mono w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 whitespace-nowrap border-b-2 border-r border-line bg-panel-2 px-3 py-2 text-left text-[10px] text-ink-soft">
                    台番号
                  </th>
                  <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-highlight">
                    平均
                    <span className="block text-[9px] text-muted">出率%</span>
                  </th>
                  {dayOptions.map((d) => (
                    <th
                      key={d}
                      className="sticky top-0 z-20 whitespace-nowrap border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft"
                    >
                      {d}のつく日
                      <span className="block text-[9px] text-muted">%</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {crossRows.map((unit, index) => {
                  const alt = index % 2 === 1 ? "bg-[var(--row-alt)]" : "";
                  return (
                    <tr key={unit.unit}>
                      <td className="sticky left-0 z-10 border-b border-r border-line-soft bg-panel px-3 py-2 text-left font-bold text-ink-soft">
                        {unit.unit}
                      </td>
                      <td className={`border-b border-r border-line-soft px-2 py-2 text-right font-bold ${unit.avg === null ? "text-muted" : rtpToneClass(unit.avg)} ${alt}`}>
                        {unit.avg === null ? "—" : unit.avg.toFixed(1)}
                      </td>
                      {unit.cells.map((cell) => (
                        <td
                          key={cell.digit}
                          className={`border-b border-r border-line-soft px-2 py-2 text-right ${cell.avg === null ? "text-muted" : rtpToneClass(cell.avg)} ${alt}`}
                        >
                          {cell.avg === null ? "—" : cell.avg.toFixed(1)}
                          {cell.avg !== null ? (
                            <span className="block text-[9px] font-normal text-muted">{cell.days}日</span>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">該当する台がありません</p>
        ) : (
          <table className="mono w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 whitespace-nowrap border-b-2 border-r border-line bg-panel-2 px-3 py-2 text-left text-[10px] text-ink-soft">
                  台番号
                </th>
                <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-highlight">
                  平均
                  <span className="block text-[9px] text-muted">出率%</span>
                </th>
                <th className="sticky top-0 z-20 whitespace-nowrap border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                  高設定
                  <span className="block text-[9px] text-muted">100%超/日</span>
                </th>
                <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                  ブレ
                  <span className="block text-[9px] text-muted">σ</span>
                </th>
                <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                  日数
                  <span className="block text-[9px] text-muted">日</span>
                </th>
                <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                  総回転
                  <span className="block text-[9px] text-muted">G</span>
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
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-ink-soft ${alt}`}>
                      {unit.hi100}/{unit.days}
                    </td>
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-muted ${alt}`}>
                      {unit.std === null ? "—" : unit.std.toFixed(1)}
                    </td>
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-muted ${alt}`}>
                      {unit.days}
                    </td>
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-ink-soft ${alt}`}>
                      {unit.games === null ? "—" : unit.games.toLocaleString("ja-JP")}
                    </td>
                    {unit.visRates.map((rate, i) => (
                      <td
                        key={aim.dates[visibleDateIdx[i]]}
                        className={`border-b border-r border-line-soft px-2 py-2 text-right ${
                          rate === null ? "text-muted" : rtpToneClass(rate)
                        } ${alt}`}
                      >
                        {rateCell(rate)}
                        {rate !== null && unit.visGames[i] !== null ? (
                          <span className="block text-[9px] font-normal text-muted">
                            {unit.visGames[i]!.toLocaleString("ja-JP")}G
                          </span>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-line bg-panel-2 px-3 py-2 text-[11px]">
        <span className="mono text-muted">
          {view === "day" ? `${crossRows.length}台` : `${rows.length}台 / 総回転 ${totals.games.toLocaleString("ja-JP")}G`}
        </span>
        <span className="mono text-ink-soft">
          トータル獲得（差枚）
          <span className={`ml-2 font-bold ${toneClass(totals.net)}`}>{formatSigned(totals.net)}枚</span>
        </span>
      </div>
    </div>
  );
}
