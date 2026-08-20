"use client";

import { useMemo } from "react";
import type { Theoretical } from "@/lib/ev/types";
import { formatSigned, rtpToneClass, toneClass } from "./format";
import { RowHead, TableFoot, TableNote, TableScroll, Td, Th, stripe } from "@/components/ui/DataTable";

/** ボーダー判定に使う機械割（%）。これを下回る行が残っている間はボーダーとしない。 */
const BORDER_RTP = 106;

type TheoreticalTableProps = {
  data: Theoretical;
  /** 時給換算に使う（economics.gamesPerHour）. */
  gamesPerHour: number;
};

export function TheoreticalTable({ data, gamesPerHour }: TheoreticalTableProps) {
  // 行間隔はデータ側の gRange.step に従う（生成側が10G刻みなら10G刻みで全部出す）。
  // 最終行（天井手前の最深G）は step で割り切れなくても必ず残す。
  const rows = useMemo(() => {
    const step = Math.max(1, data.gRange?.step ?? 10);
    const last = data.baseAnchors[data.baseAnchors.length - 1];
    return data.baseAnchors.filter((a) => a.g % step === 0 || a.g === last?.g);
  }, [data.baseAnchors, data.gRange]);

  // ボーダー＝ここから先が全部 BORDER_RTP% 以上になる最初のG。
  // 「最初に超えたG」だと浅い側のブレを拾って早すぎるボーダーが出るので、
  // 基準を割る一番深い行を探して、その次の行を採る（＝深い側のクロス点）。
  const border = useMemo(() => {
    const anchors = data.baseAnchors;
    let i = anchors.length - 1;
    while (i >= 0 && anchors[i].rtp >= BORDER_RTP) i--;
    return i + 1 < anchors.length ? anchors[i + 1].g : null;
  }, [data.baseAnchors]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <TableNote>{data.note}</TableNote>
      {/* 左右2段組にすると右側が3行に折り返して読みづらかったので、
          他のバーと同じ「見出し＋本文」の縦積みにする。 */}
      <div className="mono shrink-0 border-b border-line bg-panel px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="w-12 shrink-0 text-[9px] tracking-[0.14em] text-muted">ボーダー</span>
          <span className="text-sm font-bold text-highlight">
            {border === null ? "—" : `${border.toLocaleString("ja-JP")}G〜`}
          </span>
          <span className="text-[10px] text-muted">機械割{BORDER_RTP}%以上</span>
        </div>
        {/* 初当りGは表が実際に使っている値＝当店実測。公表の設定1とは別物なので分けて出す。 */}
        <div className="mt-1 flex flex-wrap gap-x-3 pl-14 text-[10px] text-muted">
          <span>
            当店実測 初当り {data.firstHitG.toLocaleString("ja-JP")}G ／ 獲得{" "}
            {data.avgPayout.toLocaleString("ja-JP")}枚
          </span>
          {data.specFirstHitG ? (
            <span className="text-ink-soft">
              公表 設定1 1/{data.specFirstHitG.toLocaleString("ja-JP")}
              {data.specRtp ? ` ・ ${data.specRtp.toFixed(1)}%` : ""}
            </span>
          ) : null}
        </div>
      </div>
      <TableScroll>
        <table className="mono w-full table-fixed border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <Th corner>G数</Th>
              <Th unit="円" primary>
                期待値
              </Th>
              <Th unit="%">機械割</Th>
              <Th unit="円/h">時給</Th>
              <Th unit="枚">平均投入</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, index) => {
              const alt = stripe(index);
              const hourly = a.playG ? Math.round((a.ev * gamesPerHour) / a.playG) : 0;
              return (
                <tr key={a.g}>
                  <RowHead>{a.g.toLocaleString("ja-JP")}</RowHead>
                  <Td alt={alt} bold tone={toneClass(a.ev)}>
                    {formatSigned(a.ev)}
                  </Td>
                  <Td alt={alt} tone={rtpToneClass(a.rtp)}>
                    {a.rtp.toFixed(1)}
                  </Td>
                  <Td alt={alt} tone={toneClass(hourly)}>
                    {formatSigned(hourly)}
                  </Td>
                  <Td alt={alt} tone="text-muted">
                    {a.inv?.toLocaleString("ja-JP") ?? "—"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      <TableFoot left={data.label} right={data.source} />
    </div>
  );
}
