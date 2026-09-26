"use client";

import { useState } from "react";
import type { SimpleEvSet } from "@/lib/ev/simple-ev-tables";
import { EvTableGrid, type EvTableRow } from "@/components/ev/EvTable";
import { ProfileBar } from "@/components/ev/ProfileBar";
import { ROW_HEIGHT, TableFoot, TableScroll } from "@/components/ui/DataTable";

type SimpleEvTableProps = {
  set: SimpleEvSet;
};

const NO_AXES = { axes: [] };

/**
 * 持ち込みの簡易期待値表。見た目は通常の期待値表と同じ部品
 * （狙い方の切替・算出条件・EvTableGrid・下の集計バー）で出す。
 * 数値は転記のまま再計算・補間しない。サンプル列は元表に無いので「—」。
 */
export function SimpleEvTable({ set }: SimpleEvTableProps) {
  const [key, setKey] = useState(set.tables[0]?.key ?? "");
  const [open, setOpen] = useState(false);
  const [currentG, setCurrentG] = useState(0);
  const table = set.tables.find((item) => item.key === key) ?? set.tables[0];
  if (!table) return null;
  const rows: EvTableRow[] = table.rows.map(([g, rtp, ev, hourly, medals]) => ({ g, rtp, ev, hourly, medals }));
  const first = rows[0]?.g ?? 0;
  const last = rows.at(-1)?.g ?? 0;
  const step = rows.length > 1 ? rows[1].g - rows[0].g : 10;
  const conditions = [
    { k: "出典", v: "持ち込みの簡易期待値表（店舗共通・転記のまま）" },
    ...set.notes.map((note, index) => ({ k: index === 0 ? "算出条件" : "注意", v: note.replace(/^※/, "") })),
    { k: "サンプル", v: "元の表に件数が無いため「—」" }
  ];

  return (
    <>
      <ProfileBar
        tabs={set.tables.map((item) => ({ key: item.key, label: item.label, ceiling: `${item.rows[0]?.[0] ?? 0}〜${item.rows.at(-1)?.[0] ?? 0}G` }))}
        activeKey={table.key}
        onChange={(next) => {
          setKey(next);
          setCurrentG(0);
        }}
      />
      <div className="collapsible-bar shrink-0 border-b border-line bg-panel">
        <div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="flex w-full items-center gap-3 px-3 py-2 text-left"
          >
            <span className="mono w-12 shrink-0 text-[9px] tracking-[0.14em] text-muted">算出条件</span>
            <span className="mono flex-1 truncate text-[10px] text-ink-soft">{set.notes[0]}</span>
            <span className="mono shrink-0 text-[10px] text-muted">{open ? "閉じる ▲" : "詳細 ▼"}</span>
          </button>
          {open ? (
            <dl className="mono grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line-soft px-3 py-2 text-[10px]">
              {conditions.map((row) => (
                <div key={row.k} className="contents">
                  <dt className="whitespace-nowrap text-muted">{row.k}</dt>
                  <dd className="text-ink-soft">{row.v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
      <TableScroll
        onScroll={(scrollTop) => {
          const index = Math.max(0, Math.min(rows.length - 1, Math.floor(scrollTop / ROW_HEIGHT)));
          setCurrentG(rows[index]?.g ?? first);
        }}
      >
        <EvTableGrid machine={NO_AXES} profile={{ key: table.key }} rows={rows} />
      </TableScroll>
      <TableFoot
        left={
          <>
            <span className="text-accent">{step}G</span> 刻み / {rows.length}行 / {first}〜{last}G
          </>
        }
        right={
          <>
            視点 <span className="font-bold text-highlight">{currentG.toLocaleString("ja-JP")}G</span>
          </>
        }
      />
    </>
  );
}
