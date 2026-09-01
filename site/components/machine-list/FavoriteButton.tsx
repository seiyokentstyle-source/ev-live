"use client";

import { useRef } from "react";

type FavoriteButtonProps = {
  active: boolean;
  onToggle: () => void;
};

export function FavoriteButton({ active, onToggle }: FavoriteButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  return (
    // ★ボタン本体は44pxのまま透明にし、見えるガラス円だけ36pxにする。
    //   円を小さくしてもタップ判定は落とさない（指の当たり判定は44pxが下限）。
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
      className="group absolute right-1.5 top-1.5 z-20 grid h-11 w-11 place-items-center"
    >
      <span
        // Layer 3。カード面から浮いた小さなガラス。星は円の中で主役になる大きさ。
        className={`glass-floating mono grid h-9 w-9 place-items-center text-[31px] leading-none transition-transform duration-150 group-active:scale-90 ${
          active ? "text-favorite" : "text-ink-soft"
        }`}
        style={
          active
            ? {
                // お気に入りだけ Soft Pink の光を持たせる。他の状態は Ice Blue 側なので混ざらない。
                borderColor: "rgba(255, 184, 218, 0.45)",
                boxShadow:
                  "0 4px 10px rgba(0,0,0,0.4), 0 14px 34px -18px rgba(0,0,0,0.7), 0 0 20px -4px rgba(255,184,218,0.5), inset 0 1px 0 rgba(255,255,255,0.24)"
              }
            : undefined
        }
      >
        {active ? "★" : "☆"}
      </span>
    </button>
  );
}
