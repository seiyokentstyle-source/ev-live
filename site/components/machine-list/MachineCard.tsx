"use client";

import type { Machine } from "@/lib/ev/types";
import { FavoriteButton } from "./FavoriteButton";

export type MachineSearchMatch = {
  type: "name" | "alias" | "none";
  label?: string;
};

type MachineCardProps = {
  machine: Machine;
  isFavorite: boolean;
  match: MachineSearchMatch;
  onOpen: () => void;
  onToggleFavorite: () => void;
};

export function MachineCard({ machine, isFavorite, match, onOpen, onToggleFavorite }: MachineCardProps) {
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={machine.name}
      onClick={onOpen}
      onKeyDown={(event) => {
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
        <span className="glass-control mono absolute left-2.5 top-2.5 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold text-ice">
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

      <div className={`relative flex min-h-[116px] flex-1 flex-col p-3.5 ${machine.thumb ? "" : "pr-[60px]"}`}>
        {/* 1. 機種名 */}
        <h2
          className={`line-clamp-2 text-[13px] font-bold leading-snug ${
            match.type === "name" ? "text-ice" : "text-ink"
          }`}
        >
          {machine.name}
        </h2>

        {/* 2. サンプル件数。EV Live の信頼性はここに出るので、
              カード内でいちばん読ませる数値にする。ただし期待値と誤読されない大きさに留める。 */}
        <div className="mt-auto pt-3">
          <p className="text-[9px] font-medium tracking-[0.16em] text-muted">サンプル</p>
          <p className="mono mt-0.5 flex items-baseline gap-0.5 text-[17px] font-bold leading-none text-ink">
            {machine.meta.samples}
            <span className="text-[10px] font-normal text-ink-soft">件</span>
          </p>
        </div>

        {/* 3. メーカー */}
        <p className="mono mt-2 truncate border-t border-line-soft pt-2 text-[10px] text-muted">
          {machine.manufacturer}
        </p>
      </div>
    </article>
  );
}
