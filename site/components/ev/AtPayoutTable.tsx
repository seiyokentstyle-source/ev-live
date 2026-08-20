"use client";

import { useMemo } from "react";
import type { AtPayout } from "@/lib/ev/types";
import { RowHead, TableFoot, TableNote, TableScroll, Td, Th, stripe } from "@/components/ui/DataTable";

type AtPayoutTableProps = {
  data: AtPayout;
};

export function AtPayoutTable({ data }: AtPayoutTableProps) {
  const totals = useMemo(() => {
    const count = data.bands.reduce((sum, b) => sum + b.count, 0);
    const mean = count
      ? Math.round((data.bands.reduce((sum, b) => sum + b.mean * b.count, 0) / count) * 10) / 10
      : 0;
    return { count, mean };
  }, [data.bands]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <TableNote>{data.note}</TableNote>
      <TableScroll>
        <table className="mono w-full table-fixed border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <Th corner>
                当選G
                <span className="block text-[9px] font-normal text-muted">ハマりG</span>
              </Th>
              <Th unit="%">当選率</Th>
              <Th unit="枚" primary>
                平均獲得
              </Th>
              <Th unit="枚">中央値</Th>
              <Th unit="件">サンプル</Th>
            </tr>
          </thead>
          <tbody>
            {data.bands.map((band, index) => {
              const alt = stripe(index);
              return (
                <tr key={band.lo}>
                  {/* 帯は連続しているので開始Gだけ出す（"1,200–1,249" は等幅の列に入らない）。 */}
                  <RowHead>{band.lo.toLocaleString("ja-JP")}〜</RowHead>
                  <Td alt={alt} tone={band.hit === undefined || band.hit === null ? "text-muted" : "text-ink"}>
                    {band.hit === undefined || band.hit === null ? (
                      "—"
                    ) : (
                      <>
                        {band.hit.toFixed(1)}
                        {/* 分母＝その帯に到達した件数。薄い帯を見分けられるように併記する。 */}
                        {band.alive ? (
                          <span className="block text-[9px] leading-tight text-muted">
                            /{band.alive.toLocaleString("ja-JP")}到達
                          </span>
                        ) : null}
                      </>
                    )}
                  </Td>
                  <Td alt={alt} bold tone="text-pos">
                    {band.mean.toLocaleString("ja-JP")}
                  </Td>
                  <Td alt={alt}>{band.median.toLocaleString("ja-JP")}</Td>
                  <Td alt={alt} tone="text-muted">
                    {band.count.toLocaleString("ja-JP")}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      <TableFoot
        left={`全${totals.count.toLocaleString("ja-JP")}AT`}
        right={
          <>
            平均獲得
            <span className="ml-2 font-bold text-pos">{totals.mean.toLocaleString("ja-JP")}枚</span>
          </>
        }
      />
    </div>
  );
}
