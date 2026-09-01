"use client";

import Link from "next/link";
import type { Machine } from "@/lib/ev/types";
import type { Hall } from "@/lib/halls";
import { EmptyState, TableFoot } from "@/components/ui/DataTable";
import { rewriteManufacturer } from "@/lib/ev/profiles";

type HallPendingClientProps = {
  machine: Machine;
  hall: Hall;
};

/** まだ集計していない店舗のページ。
 *  ここで既存（新宿）のデータを出すと、別店舗の設定配分をその店のものとして
 *  見せることになるので、数字は一切出さない。 */
export function HallPendingClient({ machine, hall }: HallPendingClientProps) {
  return (
    <div className="app-shell">
      <header className="grid h-12 shrink-0 grid-cols-[4rem_1fr_4rem] items-center border-b border-line bg-panel px-4">
        <Link href={`/machines/${machine.id}`} className="mono text-[11px] text-ink-soft">
          ← 店舗
        </Link>
        <h1 className="truncate px-2 text-center text-sm font-bold">{machine.name}</h1>
        <span className="mono truncate text-right text-[10px] text-muted">{rewriteManufacturer(machine.name, machine.manufacturer)}</span>
      </header>

      <div className="shrink-0 border-b border-line bg-panel px-4 py-2.5">
        <p className="mono text-[10px] tracking-[0.18em] text-highlight">{hall.area}</p>
        <p className="mt-0.5 text-sm font-bold">{hall.name}</p>
      </div>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <EmptyState title="準備中">
          この店舗はまだ集計していません。
          <br />
          データが貯まり次第、期待値稼働・設定狙い・AT獲得を表示します。
          <br />
          <br />
          他店のデータを代わりに出すことはしません。店舗ごとに設定配分が違うため、
          <br />
          そのまま当てはめると期待値の判断を誤るためです。
        </EmptyState>
      </main>

      <TableFoot left={hall.note} right="集計待ち" />
    </div>
  );
}
