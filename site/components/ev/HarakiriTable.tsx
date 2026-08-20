"use client";

import { useMemo, useState } from "react";
import type { Harakiri } from "@/lib/ev/types";
import { MonthTabs, monthOf } from "./MonthTabs";
import { ControlBar, FilterSelect, SegmentedControl } from "@/components/ui/Controls";
import { EmptyState, RowHead, TableFoot, TableNote, TableScroll, Td, Th, stripe } from "@/components/ui/DataTable";

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
      <TableNote>{harakiri.note}</TableNote>
      {hasByDate ? (
        <ControlBar label="集計">
          <SegmentedControl
            segments={[
              { value: "unit", label: "台番号別" },
              { value: "date", label: "日付別" }
            ]}
            value={view}
            onChange={setView}
          />
        </ControlBar>
      ) : null}
      {view === "date" && hasByDate ? (
        <ControlBar>
          <MonthTabs dates={allDates} value={monthFilter} onChange={setMonthFilter} />
        </ControlBar>
      ) : (
        <ControlBar label="絞り込み">
          <FilterSelect
            label="末尾"
            allLabel="全部"
            options={tailOptions}
            value={tailFilter}
            onChange={setTailFilter}
            fmt={(v) => `末尾${v}`}
          />
        </ControlBar>
      )}
      <TableScroll>
        {empty ? (
          <EmptyState>{view === "date" ? "日付別データがありません" : "該当する台がありません"}</EmptyState>
        ) : (
          <table className="mono w-full table-fixed border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <Th corner>{view === "date" ? "日付" : "台番号"}</Th>
                <Th unit="%・最大100" primary>
                  ドライブ発生率
                </Th>
                <Th unit="ラッシュ">発生</Th>
                <Th unit="回">ラッシュ</Th>
                <Th unit="回">初当り</Th>
              </tr>
            </thead>
            <tbody>
              {(view === "date" ? dateRows : rows).map((row, index) => {
                const alt = stripe(index);
                const key = "date" in row ? row.date : row.unit;
                return (
                  <tr key={key}>
                    <RowHead>{"date" in row ? shortDate(row.date) : row.unit}</RowHead>
                    <Td alt={alt} bold tone={rateToneClass(row.rate, row.rush)}>
                      {row.rush === 0 ? "—" : row.rate.toFixed(1)}
                    </Td>
                    <Td alt={alt}>{row.hits}</Td>
                    <Td alt={alt} tone="text-muted">
                      {row.rush}
                    </Td>
                    <Td alt={alt} tone="text-muted">
                      {row.sessions}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableScroll>
      <TableFoot
        left={`${view === "date" ? `${dateRows.length}日` : `${rows.length}台`} / しきい値 ${harakiri.threshold}枚`}
        right={
          <>
            機種全体
            <span className="ml-2 font-bold text-highlight">{harakiri.total.rate.toFixed(1)}%</span>
            <span className="ml-1 text-muted">
              （{harakiri.total.hits}回/{harakiri.total.rush}ラッシュ）
            </span>
          </>
        }
      />
    </div>
  );
}
