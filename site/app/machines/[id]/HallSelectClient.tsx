"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Machine } from "@/lib/ev/types";
import { HALLS } from "@/lib/halls";
import { TableFoot } from "@/components/ui/DataTable";

type HallSelectClientProps = {
  machine: Machine;
};

/** 機種を選んだあとの「どの店舗で見るか」を選ぶページ。
 *  機種選択 → ここ → 期待値稼働／設定狙い／AT獲得 の順になる。 */
export function HallSelectClient({ machine }: HallSelectClientProps) {
  const router = useRouter();
  const readyCount = HALLS.filter((hall) => hall.ready).length;

  return (
    <div className="app-shell">
      {/* 一覧・詳細と同じヘッダーの骨格（左＝戻り先、中央＝見出し、右＝補助情報）。 */}
      <header className="grid h-12 shrink-0 grid-cols-[4rem_1fr_4rem] items-center border-b border-line bg-panel px-4">
        <Link href="/machines" className="mono text-[11px] text-ink-soft">
          ← 一覧
        </Link>
        <h1 className="truncate px-2 text-center text-sm font-bold">{machine.name}</h1>
        <span className="mono truncate text-right text-[10px] text-muted">{machine.manufacturer}</span>
      </header>

      {/* 検索バーと同じ「ヘッダー直下に密着するバー」。何を選ぶ画面かをここで示す。 */}
      <div className="shrink-0 border-b border-line bg-panel px-4 py-2.5">
        <p className="mono text-[10px] tracking-[0.14em] text-muted">店舗を選ぶ</p>
        <p className="mt-1 text-xs text-ink-soft">同じ機種でも店舗ごとに設定配分が違うため、データは店舗別に分けています。</p>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-3 pb-2">
          {HALLS.map((hall) => {
            const href = `/machines/${machine.id}/${hall.id}`;
            return (
              <article
                key={hall.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(href)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") router.push(href);
                }}
                className={`rounded-lg border border-line bg-panel p-3 active:bg-panel-2 ${
                  hall.ready ? "" : "opacity-60"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="mono text-[10px] tracking-[0.18em] text-highlight">{hall.area}</p>
                    <h2 className="mt-0.5 truncate text-sm font-bold">{hall.name}</h2>
                  </div>
                  {/* データの有無をひと目で分かるようにする。準備中の店舗も導線は出す
                      （構造を先に作っておき、収集が始まったら ready を立てるだけにする）。 */}
                  <span
                    className={`mono shrink-0 rounded px-2 py-1 text-[10px] font-bold ${
                      hall.ready ? "bg-accent font-bold text-[#06131f]" : "border border-line text-muted"
                    }`}
                  >
                    {hall.ready ? "データあり" : "準備中"}
                  </span>
                </div>
                <p className="mono mt-2 text-[10px] leading-relaxed text-muted">{hall.note}</p>
                {hall.ready ? (
                  <p className="mono mt-1 text-[10px] text-muted">サンプル {machine.meta.samples}件</p>
                ) : null}
              </article>
            );
          })}
        </div>
      </main>

      <TableFoot left={`${HALLS.length}店舗 / 集計済み${readyCount}店舗`} right="店舗を選ぶと期待値表へ" />
    </div>
  );
}
