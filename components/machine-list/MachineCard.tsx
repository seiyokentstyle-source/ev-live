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
      <div className="grid aspect-square place-items-center bg-gradient-to-br from-panel-2 to-panel">
        {machine.thumb ? (
          <img src={machine.thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="text-center">
            <div className="mono text-xl font-bold tracking-wide text-ink">{machine.manufacturer}</div>
            <div className="mono mt-2 text-[10px] tracking-[0.2em] text-muted">IMG</div>
          </div>
        )}
      </div>
      <div className="min-h-[78px] border-t border-line-soft p-3">
        <h2 className={`line-clamp-2 text-sm font-bold leading-snug ${match.type === "name" ? "text-accent" : "text-ink"}`}>
          {machine.name}
        </h2>
        <p className="mono mt-2 text-[11px] text-muted">{machine.manufacturer}</p>
      </div>
    </article>
  );
}
