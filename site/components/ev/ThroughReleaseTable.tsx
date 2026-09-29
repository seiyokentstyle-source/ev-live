"use client";

import type { ThroughRelease } from "@/lib/ev/types";
import { RowHead, TableNote, TableScroll, Td, Th, stripe } from "@/components/ui/DataTable";

/** スルー回数別の穢れ解放率。件数が少ない行ほど割合が大きく振れるので件数を並べる。 */
export function ThroughReleaseTable({ data }: { data: ThroughRelease }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <TableNote>{data.note}</TableNote>
      <TableScroll>
        <table className="mono w-full table-fixed border-separate border-spacing-0 text-xs">
          <caption className="sr-only">{data.label}</caption>
          <thead>
            <tr>
              <Th corner>スルー回数</Th>
              <Th unit="%" primary>解放率</Th>
              <Th unit="件">解放</Th>
              <Th unit="件">件数</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => {
              const alt = stripe(index);
              return (
                <tr key={row.through}>
                  <RowHead>{row.label}</RowHead>
                  <Td alt={alt} tone={row.rate === null ? "text-muted" : "text-ink"}>
                    {row.rate === null ? "—" : (row.rate * 100).toFixed(1)}
                  </Td>
                  <Td alt={alt}>{row.hits.toLocaleString("ja-JP")}</Td>
                  <Td alt={alt}>{row.n.toLocaleString("ja-JP")}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}
