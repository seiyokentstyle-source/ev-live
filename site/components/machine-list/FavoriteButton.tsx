"use client";

import { useRef } from "react";

type FavoriteButtonProps = {
  active: boolean;
  onToggle: () => void;
};

export function FavoriteButton({ active, onToggle }: FavoriteButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={ref}
      type="button"
      aria-label={active ? "お気に入り解除" : "お気に入り登録"}
      onClick={(event) => {
        event.stopPropagation();
        ref.current?.classList.remove("bump");
        if (ref.current) void ref.current.offsetWidth;
        ref.current?.classList.add("bump");
        onToggle();
      }}
      className={`mono absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full border text-lg backdrop-blur ${
        active
          ? "border-highlight bg-black/60 text-highlight shadow-[0_0_18px_rgba(255,204,68,0.35)]"
          : "border-white/10 bg-black/50 text-ink-soft"
      }`}
    >
      {active ? "★" : "☆"}
    </button>
  );
}
