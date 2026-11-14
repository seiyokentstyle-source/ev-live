"use client";

import type { BaseAnchor, Machine, PivotConfig, Profile, TableRow } from "@/lib/ev/types";
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
  profile: Pick<Profile, "key"> & Partial<Pick<Profile, "sampleKind">>;
  rows: EvTableRow[];
  pivot?: PivotConfig;
  /** 絞り込む前の表のアンカー。周期モデルの表で実件数・推定件数を出すのに使う。 */
  realAnchors?: BaseAnchor[];
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

export function EvTable({ machine, profile, rows, pivot, realAnchors, onViewGChange }: EvTableProps) {
  return (
    <TableScroll
      onScroll={(scrollTop) => {
        const index = Math.max(0, Math.min(rows.length - 1, Math.floor(scrollTop / ROW_HEIGHT)));
        onViewGChange(rows[index]?.g ?? profile.gRange.start);
      }}
    >
      <EvTableGrid machine={machine} profile={profile} rows={rows} pivot={pivot} realAnchors={realAnchors} />
    </TableScroll>
  );
}

/**
 * 周期モデルの表（期待値は試算、n＝試算の回数）では、サンプル欄を2列にする（利用者指定 2026-11-14）。
 * 実件数＝そのG数まで届いた実際のセッション数（絞り込み不問）。
 * 推定件数＝実件数×（その条件の試算回数÷不問の試算回数）。周期・ポイントはカウンターに出ないので実数は無い。
 */
export function realSampleCounts(row: Pick<TableRow, "g" | "n">, anchors: BaseAnchor[] | undefined) {
  const base = anchors?.find((anchor) => anchor.g === row.g);
  const real = base?.realN;
  if (real === undefined) return { real: undefined, estimate: undefined };
  const estimate = row.n !== undefined && base?.n ? Math.round((real * row.n) / base.n) : undefined;
  return { real, estimate };
}

export function EvTableGrid({ machine, profile, rows, pivot, realAnchors }: EvTableGridProps) {
  const pivotColumns = pivot ? pivotHeader(machine, pivot) : [];
  const realColumns = profile.sampleKind === "cycle-model" && Boolean(realAnchors?.some((anchor) => anchor.realN !== undefined));

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
                  {realColumns ? (
                    <>
                      <Th unit="件(不問)">実件数</Th>
                      <Th unit="件">推定件数</Th>
                    </>
                  ) : (
                    <Th unit="件">サンプル</Th>
                  )}
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
                      {realColumns ? (
                        (() => {
                          const counts = realSampleCounts(row, realAnchors);
                          return (
                            <>
                              <Td alt={alt} tone="text-muted">
                                {counts.real === undefined ? "—" : counts.real.toLocaleString("ja-JP")}
                              </Td>
                              <Td alt={alt} tone="text-muted">
                                {dash || counts.estimate === undefined ? "—" : counts.estimate.toLocaleString("ja-JP")}
                              </Td>
                            </>
                          );
                        })()
                      ) : (
                        <Td alt={alt} tone="text-muted">
                          {row.n === undefined ? "—" : row.n.toLocaleString("ja-JP")}
                        </Td>
                      )}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
  );
}
