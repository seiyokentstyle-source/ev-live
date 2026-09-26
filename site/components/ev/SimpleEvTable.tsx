"use client";

import { useState } from "react";
import type { SimpleEvSet } from "@/lib/ev/simple-ev-tables";
import { ControlBar, SegmentedControl } from "@/components/ui/Controls";
import { RowHead, TableFoot, TableNote, TableScroll, Td, Th, stripe } from "@/components/ui/DataTable";

type SimpleEvTableProps = {
  set: SimpleEvSet;
};

function signed(value: number): string {
  const text = Math.abs(value).toLocaleString("ja-JP");
  return value > 0 ? `+${text}` : value < 0 ? `-${text}` : "0";
}

function tone(value: number): string {
  return value > 0 ? "text-pos" : value < 0 ? "text-neg" : "text-ink-soft";
}

/** 持ち込みの簡易期待値表。収集データからの算出ではないので再計算・補間はしない。 */
export function SimpleEvTable({ set }: SimpleEvTableProps) {
  const [key, setKey] = useState(set.tables[0]?.key ?? "");
  const table = set.tables.find((item) => item.key === key) ?? set.tables[0];
  if (!table) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <TableNote>{set.notes.join(" ")}</TableNote>
      {set.tables.length > 1 ? (
        <ControlBar label="条件" scroll>
          <SegmentedControl
            segments={set.tables.map((item) => ({ value: item.key, label: item.label }))}
            value={table.key}
            onChange={setKey}
          />
        </ControlBar>
      ) : null}
      <TableScroll>
        <table className="mono w-full table-fixed border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <Th corner>G数</Th>
              <Th unit="%">機械割</Th>
              <Th unit="円" primary>期待値</Th>
              <Th unit="円/h">時給</Th>
              <Th unit="枚">平均投入</Th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map(([g, rtp, ev, hourly, invest], index) => {
              const alt = stripe(index);
              return (
                <tr key={g}>
                  <RowHead>{g}</RowHead>
                  <Td alt={alt} tone={rtp >= 100 ? "text-pos" : "text-neg"}>{rtp.toFixed(1)}</Td>
                  <Td alt={alt} bold tone={tone(ev)}>{signed(ev)}</Td>
                  <Td alt={alt} tone={tone(hourly)}>{signed(hourly)}</Td>
                  <Td alt={alt} tone="text-muted">{invest}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      <TableFoot left={`${set.title}｜${table.label}`} right="簡易期待値表（持ち込み）" />
    </div>
  );
}
