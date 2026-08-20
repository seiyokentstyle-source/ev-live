"use client";

import { useMemo, useState } from "react";
import type { SettingAim } from "@/lib/ev/types";
import { formatSigned, rtpToneClass, toneClass } from "./format";
import { MonthTabs, monthOf } from "./MonthTabs";
import { ControlBar, FilterSelect, SegmentedControl } from "@/components/ui/Controls";
import { EmptyState, RowHead, TableFoot, TableNote, TableScroll, Td, Th, stripe } from "@/components/ui/DataTable";

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

export function SettingAimTable({ aim }: SettingAimTableProps) {
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
      <TableNote>
        {aim.note}
        {view === "date"
          ? "　※高設定＝出率100%超だった日数、ブレ＝出率の標準偏差（小さいほど安定）。"
          : "　※各セルは「その数字のつく日」の平均出率。特定日に強い台を探す用。"}
      </TableNote>
      <ControlBar label="集計">
        <SegmentedControl
          segments={[
            { value: "date", label: "日付別" },
            { value: "day", label: "つく日別" }
          ]}
          value={view}
          onChange={setView}
        />
      </ControlBar>
      <ControlBar>
        <MonthTabs dates={aim.dates} value={monthFilter} onChange={setMonthFilter} />
      </ControlBar>
      <ControlBar label="絞り込み">
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
      </ControlBar>
      <TableScroll>
        {view === "day" ? (
          crossRows.length === 0 ? (
            <EmptyState>該当する台がありません</EmptyState>
          ) : (
            <table className="mono w-full table-fixed border-separate border-spacing-0 text-xs">
              <colgroup>
                <col className="w-[88px]" />
                <col className="w-[62px]" />
                {dayOptions.map((d) => (
                  <col key={d} className="w-[84px]" />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <Th corner>台番号</Th>
                  <Th unit="出率%" primary>
                    平均
                  </Th>
                  {dayOptions.map((d) => (
                    <Th key={d} unit="%">
                      {d}のつく日
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {crossRows.map((unit, index) => {
                  const alt = stripe(index);
                  return (
                    <tr key={unit.unit}>
                      <RowHead>{unit.unit}</RowHead>
                      <Td alt={alt} bold tone={unit.avg === null ? "text-muted" : rtpToneClass(unit.avg)}>
                        {unit.avg === null ? "—" : unit.avg.toFixed(1)}
                      </Td>
                      {unit.cells.map((cell) => (
                        <Td key={cell.digit} alt={alt} tone={cell.avg === null ? "text-muted" : rtpToneClass(cell.avg)}>
                          {cell.avg === null ? "—" : cell.avg.toFixed(1)}
                          {cell.avg !== null ? (
                            <span className="block text-[9px] font-normal leading-tight text-muted">{cell.days}日</span>
                          ) : null}
                        </Td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : rows.length === 0 ? (
          <EmptyState>該当する台がありません</EmptyState>
        ) : (
          <table className="mono w-full table-fixed border-separate border-spacing-0 text-xs">
            <colgroup>
              <col className="w-[88px]" />
              <col className="w-[62px]" />
              <col className="w-[64px]" />
              <col className="w-[50px]" />
              <col className="w-[46px]" />
              <col className="w-[80px]" />
              {visibleDateIdx.map((i) => (
                <col key={aim.dates[i]} className="w-[74px]" />
              ))}
            </colgroup>
            <thead>
              <tr>
                <Th corner>台番号</Th>
                <Th unit="出率%" primary>
                  平均
                </Th>
                <Th unit="100%超/日">高設定</Th>
                <Th unit="σ">ブレ</Th>
                <Th unit="日">日数</Th>
                <Th unit="G">総回転</Th>
                {visibleDateIdx.map((i) => (
                  <Th key={aim.dates[i]} unit="%">
                    {shortDate(aim.dates[i])}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((unit, index) => {
                const alt = stripe(index);
                return (
                  <tr key={unit.unit}>
                    <RowHead sub={`${formatSigned(unit.net)}枚`}>{unit.unit}</RowHead>
                    <Td alt={alt} bold tone={unit.avg === null ? "text-muted" : rtpToneClass(unit.avg)}>
                      {unit.avg === null ? "—" : unit.avg.toFixed(1)}
                    </Td>
                    <Td alt={alt}>
                      {unit.hi100}/{unit.days}
                    </Td>
                    <Td alt={alt} tone="text-muted">
                      {unit.std === null ? "—" : unit.std.toFixed(1)}
                    </Td>
                    <Td alt={alt} tone="text-muted">
                      {unit.days}
                    </Td>
                    <Td alt={alt}>{unit.games === null ? "—" : unit.games.toLocaleString("ja-JP")}</Td>
                    {unit.visRates.map((rate, i) => (
                      <Td
                        key={aim.dates[visibleDateIdx[i]]}
                        alt={alt}
                        tone={rate === null ? "text-muted" : rtpToneClass(rate)}
                      >
                        {rateCell(rate)}
                        {rate !== null && unit.visGames[i] !== null ? (
                          <span className="block text-[9px] font-normal leading-tight text-muted">
                            {unit.visGames[i]!.toLocaleString("ja-JP")}G
                          </span>
                        ) : null}
                      </Td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableScroll>
      <TableFoot
        left={view === "day" ? `${crossRows.length}台` : `${rows.length}台 / 総回転 ${totals.games.toLocaleString("ja-JP")}G`}
        right={
          <>
            トータル獲得（差枚）
            <span className={`ml-2 font-bold ${toneClass(totals.net)}`}>{formatSigned(totals.net)}枚</span>
          </>
        }
      />
    </div>
  );
}
