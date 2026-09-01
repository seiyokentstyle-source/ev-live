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
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation();
        ref.current?.classList.remove("bump");
        if (ref.current) void ref.current.offsetWidth;
        ref.current?.classList.add("bump");
        onToggle();
      }}
      /* Layer 3。カード面から浮いた小さなガラス。44px確保してタップ判定を稼ぐ。 */
      /* 円は機種名2行ぶんの高さに合わせる。星はその中で主役になる大きさにする。 */
      className={`glass-floating mono absolute right-2 top-2 z-20 grid h-12 w-12 place-items-center text-[26px] leading-none ${
        active ? "text-favorite" : "text-ink-soft"
      }`}
      style={
        active
          ? {
              /* お気に入りだけ Soft Pink の光を持たせる。他の状態は Ice Blue 側なので混ざらない。 */
              borderColor: "rgba(255, 184, 218, 0.45)",
              boxShadow:
                "0 4px 10px rgba(0,0,0,0.4), 0 14px 34px -18px rgba(0,0,0,0.7), 0 0 20px -4px rgba(255,184,218,0.5), inset 0 1px 0 rgba(255,255,255,0.24)"
            }
          : undefined
      }
    >
      {active ? "★" : "☆"}
    </button>
  );
}
