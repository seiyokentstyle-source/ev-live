"use client";

import Link from "next/link";
import type { CounterEstimate, MachineSummary, ProvisionalSetting1 } from "@/lib/ev/types";
import { ProvisionalSetting1Table } from "@/components/ev/ProvisionalSetting1Table";
import { CounterEstimateTable } from "@/components/ev/CounterEstimateTable";
import type { Hall } from "@/lib/halls";
import { EmptyState, TableFoot } from "@/components/ui/DataTable";
import { rewriteManufacturer } from "@/lib/ev/profiles";
import type { CollectedMachine } from "@/lib/collection-status-contract";
import { collectionStatus } from "@/lib/ev/collection-status";

type HallPendingClientProps = {
  machine: MachineSummary;
  hall: Hall;
  collection?: CollectedMachine;
  provisionalSetting1?: ProvisionalSetting1;
  counterEstimate?: CounterEstimate;
};

/** 未集計・算出保留の店舗のページ。他店の実測値は転載しない。
 *  公表入力だけの暫定参考表は、この店舗の収集が確認でき、機種IDと正式名が登録に一致する場合に限る。 */
export function HallPendingClient({ machine, hall, collection, provisionalSetting1, counterEstimate }: HallPendingClientProps) {
  const counts = collection?.summary.meta.collection;
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
        {collection && counts ? <>
          <p className="mono shrink-0 border-b border-line bg-panel px-4 py-2 text-[11px] text-ink-soft">{collectionStatus(collection.summary.meta)}</p>
          <details className="mono shrink-0 border-b border-line bg-panel px-4 py-2 text-[10px] text-ink-soft">
            <summary className="cursor-pointer">収集状況 · 信号 {counts.events.toLocaleString("ja-JP")}件・保存 {counts.rows.toLocaleString("ja-JP")}行・{counts.units}台・{counts.days}日</summary>
            <p className="mt-2">保存期間：{counts.firstDate}〜{counts.lastDate}</p>
            {!collection.collectionComplete ? <p className="mt-1">全台分の取得確認はまだ完了していません。保存済みの件数を表示しています。</p> : null}
            {counts.rows === 0 ? <p className="mt-1">台の日次情報は保存済みですが、当たり履歴はまだ保存されていません。</p> : null}
          </details>
          {counterEstimate ? <>
            <p className="shrink-0 border-b border-line px-4 py-2 text-[11px] text-muted">実戦期待値は算出保留：{collection.pendingReason}</p>
            <CounterEstimateTable data={counterEstimate} />
          </> : provisionalSetting1 ? <>
            <p className="shrink-0 border-b border-line px-4 py-2 text-[11px] text-muted">実戦期待値は算出保留：{collection.pendingReason}</p>
            <ProvisionalSetting1Table data={provisionalSetting1} />
          </> : <EmptyState title="期待値算出保留">{collection.pendingReason}</EmptyState>}
        </> : <>
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
        </>}
      </main>

      <TableFoot left={collection ? "保存済みの履歴を表示" : hall.note} right={collection ? "期待値算出保留" : "集計待ち"} />
    </div>
  );
}
