"use client";

import type { Machine, PivotConfig, Profile, TableRow } from "@/lib/ev/types";
import { formatSigned, rtpToneClass, toneClass } from "./format";

type EvTableProps = {
  machine: Machine;
  profile: Profile;
  rows: TableRow[];
  pivot?: PivotConfig;
  onViewGChange: (g: number) => void;
};

function pivotHeader(machine: Machine, pivot: PivotConfig): Array<{ value: string; label: string }> {
  const axis = machine.axes.find((candidate) => candidate.key === pivot.axisKey);
  if (!axis || axis.type !== "select") return [];
  return pivot.values.map((value) => ({
    value,
    label: axis.options.find((option) => option.value === value)?.label ?? value
  }));
}

export function EvTable({ machine, profile, rows, pivot, onViewGChange }: EvTableProps) {
  const pivotColumns = pivot ? pivotHeader(machine, pivot) : [];

  // Discourage casual copying of the EV numbers: block text selection, the
  // right-click/long-press menu, and copy/cut. This only deters; screenshots and
  // devtools can still read the values. Scoped to the table container so the rest
  // of the page stays selectable.
  const blockEvent = (event: { preventDefault: () => void }) => event.preventDefault();

  return (
    <div
      className="min-h-0 flex-1 select-none overflow-auto bg-bg [-webkit-touch-callout:none]"
      onCopy={blockEvent}
      onCut={blockEvent}
      onContextMenu={blockEvent}
      onScroll={(event) => {
        const container = event.currentTarget;
        const rowHeight = 34;
        const index = Math.max(0, Math.min(rows.length - 1, Math.floor(container.scrollTop / rowHeight)));
        onViewGChange(rows[index]?.g ?? profile.gRange.start);
      }}
    >
      <table className="mono w-full min-w-[430px] table-fixed border-separate border-spacing-0 text-xs">
        {pivot ? (
          <colgroup>
            <col className="w-[70px]" />
            {pivotColumns.map((column) => (
              <col key={column.value} className="w-[92px]" />
            ))}
            <col className="w-[88px]" />
          </colgroup>
        ) : (
          <colgroup>
            <col className="w-[70px]" />
            <col className="w-[72px]" />
            <col className="w-[88px]" />
            <col className="w-[96px]" />
            <col className="w-[88px]" />
            <col className="w-[58px]" />
          </colgroup>
        )}
        <thead>
          {pivot ? (
            <tr>
              <th className="sticky left-0 top-0 z-30 border-b-2 border-r border-line bg-panel-2 px-3 py-2 text-left text-[10px] text-ink-soft">
                G数
              </th>
              {pivotColumns.map((column) => (
                <th
                  key={column.value}
                  className="sticky top-0 z-20 truncate border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-highlight"
                >
                  {column.label}
                  <span className="block text-[9px] text-muted">期待値(円)</span>
                </th>
              ))}
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                平均投入
                <span className="block text-[9px] text-muted">枚</span>
              </th>
            </tr>
          ) : (
            <tr>
              <th className="sticky left-0 top-0 z-30 border-b-2 border-r border-line bg-panel-2 px-3 py-2 text-left text-[10px] text-ink-soft">
                G数
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                機械割
                <span className="block text-[9px] text-muted">%</span>
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                期待値
                <span className="block text-[9px] text-muted">円</span>
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                時給
                <span className="block text-[9px] text-muted">円/h</span>
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                平均投入
                <span className="block text-[9px] text-muted">枚</span>
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-r border-line-soft bg-panel-2 px-2 py-2 text-right text-[10px] text-ink-soft">
                件数
                <span className="block text-[9px] text-muted">n</span>
              </th>
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const alt = index % 2 === 1 ? "bg-[var(--row-alt)]" : "";
            return (
              <tr key={row.g}>
                <td className="sticky left-0 z-10 border-b border-r border-line-soft bg-panel px-3 py-2 text-left text-ink-soft">
                  <span className={row.zoneLabel ? "font-bold text-highlight" : ""}>
                    {row.zoneLabel ? "▸ " : ""}
                    {row.g}
                  </span>
                  {row.zoneLabel ? <span className="block truncate text-[9px] text-highlight opacity-70">{row.zoneLabel}</span> : null}
                </td>
                {pivot ? (
                  <>
                    {pivotColumns.map((column) => {
                      const ev = row.pivotValues?.[column.value] ?? 0;
                      return (
                        <td
                          key={column.value}
                          className={`border-b border-r border-line-soft px-2 py-2 text-right ${
                            row.noData ? "text-muted" : toneClass(ev)
                          } ${alt}`}
                        >
                          {row.noData ? "—" : formatSigned(ev)}
                        </td>
                      );
                    })}
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-ink-soft ${alt}`}>
                      {row.noData ? "—" : row.medals.toLocaleString("ja-JP")}
                    </td>
                  </>
                ) : (
                  <>
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right ${
                      row.noData ? "text-muted" : rtpToneClass(row.rtp)
                    } ${alt}`}>
                      {row.noData ? "—" : `${row.rtp.toFixed(1)}%`}
                    </td>
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right ${
                      row.noData ? "text-muted" : toneClass(row.ev)
                    } ${alt}`}>
                      {row.noData ? "—" : formatSigned(row.ev)}
                    </td>
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right ${
                      row.noData ? "text-muted" : toneClass(row.hourly)
                    } ${alt}`}>
                      {row.noData ? "—" : formatSigned(row.hourly)}
                    </td>
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-ink-soft ${alt}`}>
                      {row.noData ? "—" : row.medals.toLocaleString("ja-JP")}
                    </td>
                    <td className={`border-b border-r border-line-soft px-2 py-2 text-right text-muted ${alt}`}>
                      {row.n === undefined ? "—" : row.n.toLocaleString("ja-JP")}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
