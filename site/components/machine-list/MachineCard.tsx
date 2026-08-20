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
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      className="relative overflow-hidden rounded-lg border border-line bg-panel active:bg-panel-2"
    >
      <FavoriteButton active={isFavorite} onToggle={onToggleFavorite} />
      {match.type === "alias" && match.label ? (
        <span className="mono absolute left-2 top-2 z-10 rounded bg-accent px-2 py-1 text-[10px] font-bold text-white">
          {match.label}
        </span>
      ) : null}
      {/* 画像は今のところ全機種 null。正方形の枠を常に置くとカードの6割が空白になり、
          1画面に4機種しか入らない。画像があるときだけ枠を出す。 */}
      {machine.thumb ? (
        <div className="grid aspect-square place-items-center border-b border-line-soft bg-gradient-to-br from-panel-2 to-panel">
          <img src={machine.thumb} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <div className={`min-h-[84px] p-3 ${machine.thumb ? "" : "pr-12"}`}>
        <h2 className={`line-clamp-2 text-sm font-bold leading-snug ${match.type === "name" ? "text-accent" : "text-ink"}`}>
          {machine.name}
        </h2>
        <p className="mono mt-2 truncate text-[11px] text-muted">{machine.manufacturer}</p>
        {/* 空いた場所には飾りではなく、機種を選ぶ材料（母数）を出す。 */}
        <p className="mono mt-1 text-[10px] text-muted">サンプル {machine.meta.samples}件</p>
      </div>
    </article>
  );
}
