"use client";

import { useRef } from "react";

type FavoriteButtonProps = {
  active: boolean;
  onToggle: () => void;
};

export function FavoriteButton({ active, onToggle }: FavoriteButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  return (
    // ★ボタン本体は44pxのまま透明にし、見えるガラス円だけ33pxにする。
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
        // Layer 3。カード面から浮いた小さなガラス。
        className={`glass-floating grid h-[33px] w-[33px] place-items-center transition-transform duration-150 group-active:scale-90 ${
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
        {/* ★☆ の文字は上下の余白が非対称で、どう揃えても円の中心へ来ない
            （グリフがベースラインの上に乗るため）。図形なら幾何中心で揃う。 */}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[21px] w-[21px]" fill="none">
          <path
            d="M12 3.1l2.72 5.51 6.08.88-4.4 4.29 1.04 6.06L12 16.98l-5.44 2.86 1.04-6.06-4.4-4.29 6.08-.88z"
            fill={active ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={active ? 0 : 1.7}
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}
