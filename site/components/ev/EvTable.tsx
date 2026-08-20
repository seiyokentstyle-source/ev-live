"use client";

import type { Machine, PivotConfig, Profile, TableRow } from "@/lib/ev/types";
import { formatSigned, toneClass } from "./format";
import { ROW_HEIGHT, RowHead, TableScroll, Td, Th, stripe } from "@/components/ui/DataTable";

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
  // ptカウンタ機（マギレコ）はG列にpt目盛りを併記する。実機はptしか見えないので、
  // 「今何pt」から表を引けるようにするため。EVの計算はG基準のまま＝表示だけの話。
  const ptPerG = profile.ptPerG;

  return (
    <TableScroll
      onScroll={(scrollTop) => {
        const index = Math.max(0, Math.min(rows.length - 1, Math.floor(scrollTop / ROW_HEIGHT)));
        onViewGChange(rows[index]?.g ?? profile.gRange.start);
      }}
    >
        {/* 列が6本あり、狭い画面で%指定だと全列が潰れて読めなくなる。
            最小幅をpxで確保し、足りない分は横スクロール（G列はsticky）。 */}
        {/* table-fixed で列幅を指定しなければ、全列が等幅で画面幅ぴったりに割り付けられる。
          横スクロールは無くなる。G数は4桁までなので1/6の幅で足りる。 */}
      <table className="mono w-full table-fixed border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <Th corner>
                G数
                {ptPerG ? <span className="block text-[9px] font-normal text-muted">≒pt</span> : null}
              </Th>
              {pivot ? (
                <>
                  {pivotColumns.map((column) => (
                    <Th key={column.value} unit="期待値(円)" primary>
                      {column.label}
                    </Th>
                  ))}
                  <Th unit="枚">平均投入</Th>
                </>
              ) : (
                <>
                  <Th unit="%">機械割</Th>
                  <Th unit="円" primary>
                    期待値
                  </Th>
                  <Th unit="円/h">時給</Th>
                  <Th unit="枚">平均投入</Th>
                  <Th unit="件">サンプル</Th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const alt = stripe(index);
              const dash = row.noData;
              return (
                <tr key={row.g}>
                  <RowHead
                    sub={
                      <>
                        {ptPerG ? <span className="block">≒{Math.round(row.g * ptPerG).toLocaleString("ja-JP")}pt</span> : null}
                        {/* ゾーン名は狭い列に入るので折り返す（切り詰めると「ゾーン〜」しか読めない）。 */}
                        {row.zoneLabel ? <span className="block text-highlight opacity-70">{row.zoneLabel}</span> : null}
                      </>
                    }
                  >
                    <span className={row.zoneLabel ? "text-highlight" : ""}>{row.g.toLocaleString("ja-JP")}</span>
                  </RowHead>
                  {pivot ? (
                    <>
                      {pivotColumns.map((column) => {
                        const ev = row.pivotValues?.[column.value] ?? 0;
                        return (
                          <Td key={column.value} alt={alt} bold={!dash} tone={dash ? "text-muted" : toneClass(ev)}>
                            {dash ? "—" : formatSigned(ev)}
                          </Td>
                        );
                      })}
                      <Td alt={alt}>{dash ? "—" : row.medals.toLocaleString("ja-JP")}</Td>
                    </>
                  ) : (
                    <>
                      {/* 機械割はOUT÷INなので100%は損益分岐ではない（46/52は約113%）。
                          勝ち負けは期待値の符号で塗る。 */}
                      <Td alt={alt} tone={dash ? "text-muted" : toneClass(row.ev)}>
                        {dash ? "—" : row.rtp.toFixed(1)}
                      </Td>
                      <Td alt={alt} bold={!dash} tone={dash ? "text-muted" : toneClass(row.ev)}>
                        {dash ? "—" : formatSigned(row.ev)}
                      </Td>
                      <Td alt={alt} tone={dash ? "text-muted" : toneClass(row.hourly)}>
                        {dash ? "—" : formatSigned(row.hourly)}
                      </Td>
                      <Td alt={alt}>{dash ? "—" : row.medals.toLocaleString("ja-JP")}</Td>
                      <Td alt={alt} tone="text-muted">
                        {row.n === undefined ? "—" : row.n.toLocaleString("ja-JP")}
                      </Td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
    </TableScroll>
  );
}
