"use client";

import type { Machine, PivotConfig, Profile, TableRow } from "@/lib/ev/types";
import { roundedRtp } from "@/lib/ev/rtp";
import { formatSigned, rtpToneClass, toneClass } from "./format";
import { ROW_HEIGHT, RowHead, TableScroll, Td, Th, stripe } from "@/components/ui/DataTable";

/** 集計にない指標は空欄にできる。通常表と狙い目で同じグリッドを使う。 */
export type EvTableRow = Omit<TableRow, "ev" | "rtp" | "hourly" | "medals"> & {
  ev: number | null;
  rtp: number | null;
  hourly: number | null;
  medals: number | null;
};

type EvTableGridProps = {
  /** ピボット列の見出しにだけ使う（簡易期待値表は軸を持たない）. */
  machine: Pick<Machine, "axes">;
  profile: Pick<Profile, "key">;
  rows: EvTableRow[];
  pivot?: PivotConfig;
};

type EvTableProps = EvTableGridProps & {
  profile: Profile;
  onViewGChange: (g: number) => void;
};

function pivotHeader(machine: Pick<Machine, "axes">, pivot: PivotConfig): Array<{ value: string; label: string }> {
  const axis = machine.axes.find((candidate) => candidate.key === pivot.axisKey);
  if (!axis || axis.type !== "select") return [];
  return pivot.values.map((value) => ({
    value,
    label: axis.options.find((option) => option.value === value)?.label ?? value
  }));
}

export function EvTable({ machine, profile, rows, pivot, onViewGChange }: EvTableProps) {
  return (
    <TableScroll
      onScroll={(scrollTop) => {
        const index = Math.max(0, Math.min(rows.length - 1, Math.floor(scrollTop / ROW_HEIGHT)));
        onViewGChange(rows[index]?.g ?? profile.gRange.start);
      }}
    >
      <EvTableGrid machine={machine} profile={profile} rows={rows} pivot={pivot} />
    </TableScroll>
  );
}

export function EvTableGrid({ machine, profile, rows, pivot }: EvTableGridProps) {
  const pivotColumns = pivot ? pivotHeader(machine, pivot) : [];

  return (
      // 6列を等幅にし、G列と見出しを固定する。狙い目にも同じ配置・色・単位を使う。
      <table className="mono w-full table-fixed border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <Th corner>
                G数
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
                  <Th unit="%">{profile.key.endsWith("_4652") ? "換算機械割" : "機械割"}</Th>
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
                      <Td alt={alt}>{dash || row.medals === null ? "—" : row.medals.toLocaleString("ja-JP")}</Td>
                    </>
                  ) : (
                    <>
                      <Td alt={alt} tone={dash || row.rtp === null ? "text-muted" : rtpToneClass(row.rtp)}>
                        {dash || row.rtp === null ? "—" : roundedRtp(row.rtp).toFixed(1)}
                      </Td>
                      <Td alt={alt} bold={!dash && row.ev !== null} tone={dash || row.ev === null ? "text-muted" : toneClass(row.ev)}>
                        {dash || row.ev === null ? "—" : formatSigned(row.ev)}
                      </Td>
                      <Td alt={alt} tone={dash || row.hourly === null ? "text-muted" : toneClass(row.hourly)}>
                        {dash || row.hourly === null ? "—" : formatSigned(row.hourly)}
                      </Td>
                      <Td alt={alt}>{dash || row.medals === null ? "—" : row.medals.toLocaleString("ja-JP")}</Td>
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
  );
}
