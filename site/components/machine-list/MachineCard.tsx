"use client";

import type { MachineSummary } from "@/lib/ev/types";
import { collectionStatus } from "@/lib/ev/collection-status";
import { FavoriteButton } from "./FavoriteButton";
import { getHall } from "@/lib/halls";

export type MachineSearchMatch = {
  type: "name" | "alias" | "none";
  label?: string;
};

type MachineCardProps = {
  machine: MachineSummary;
  isFavorite: boolean;
  match: MachineSearchMatch;
  onOpen: () => void;
  onToggleFavorite: () => void;
};

export function MachineCard({ machine, isFavorite, match, onOpen, onToggleFavorite }: MachineCardProps) {
  const pendingStatus = collectionStatus(machine.meta);
  const hallName = machine.summaryHallId ? getHall(machine.summaryHallId)?.name ?? machine.summaryHallId : null;
  const hasTotal = machine.totalSamples !== undefined;
  const samples = hasTotal ? machine.totalSamples!.toLocaleString("ja-JP") : machine.meta.samples;
  const games = hasTotal ? machine.totalGames : machine.games;
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={machine.name}
      onClick={onOpen}
      onKeyDown={(event) => {
        // 子のお気に入りボタンの Enter / Space はボタン自身に処理させる。
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      /* Layer 2。押下時の見た目は .glass-card:active（沈む＋影が縮む）に任せる。
         モバイル主体なので hover に情報を載せない。 */
      className="glass-card group relative flex flex-col overflow-hidden text-left"
    >
      <FavoriteButton active={isFavorite} onToggle={onToggleFavorite} />

      {match.type === "alias" && match.label ? (
        <span className="glass-control mono absolute left-2.5 top-2.5 z-10 rounded-md px-2.5 py-1 text-[10px] font-bold text-ice">
          {match.label}
        </span>
      ) : null}

      {/* 画像は今のところ全機種 null。正方形の枠を常に置くとカードの6割が空白になり、
          1画面に4機種しか入らない。画像があるときだけ枠を出す。 */}
      {machine.thumb ? (
        <div className="relative grid aspect-square place-items-center overflow-hidden border-b border-line-soft">
          <img src={machine.thumb} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}

      <div className={`relative flex min-h-[116px] flex-1 flex-col p-3.5 ${machine.thumb ? "" : "pr-[52px]"}`}>
        {/* 1. 機種名 */}
        <h2
          className={`line-clamp-2 text-[13px] font-bold leading-snug ${
            match.type === "name" ? "text-ice" : "text-ink"
          }`}
        >
          {machine.name}
        </h2>

        {/* 2. サンプル件数。EVOT の信頼性はここに出るので、
              カード内でいちばん読ませる数値にする。ただし期待値と誤読されない大きさに留める。 */}
        <div className="mt-auto pt-3">
          {hasTotal || hallName ? <p className="mono mb-1 text-[9px] text-muted">{hasTotal ? "全店舗合計" : hallName}</p> : null}
          {pendingStatus && !hasTotal ? <p className="mono text-[11px] leading-relaxed text-ink-soft">{pendingStatus}</p> : <>
          <p className="text-[9px] font-medium tracking-[0.16em] text-muted">サンプル（AT突入回数）</p>
          {/* 件数とG数は折り返さず1行。画像なしのカードは右上のお気に入りボタン用の余白を取っているが、
                この行はボタンより下にあるので、その余白まで使う。 */}
          <p className={`mono mt-0.5 flex items-baseline gap-0.5 whitespace-nowrap text-[17px] font-bold leading-none text-ink ${machine.thumb ? "" : "-mr-[38px]"}`}>
            {samples}
            <span className="text-[10px] font-normal text-ink-soft">回</span>
            {games !== undefined ? <span className="ml-1 text-[10px] font-normal text-ink-soft">約{formatGames(games)}G</span> : null}
          </p>
          </>}
          {hasTotal && pendingStatus ? <p className="mono mt-1 text-[10px] leading-relaxed text-ink-soft">{hallName ? `${hallName}：` : ""}{pendingStatus}</p> : null}
        </div>

        {/* 3. メーカー */}
        <p className="mono mt-2 truncate border-t border-line-soft pt-2 text-[10px] text-muted">
          {machine.manufacturer}
        </p>
      </div>
    </article>
  );
}

/** 設定狙い表の総回転を「約1,234万G」の形にする。1万G未満はそのまま。 */
export function formatGames(games: number): string {
  if (games < 10000) return Math.round(games).toLocaleString("ja-JP");
  return `${Math.round(games / 10000).toLocaleString("ja-JP")}万`;
}
