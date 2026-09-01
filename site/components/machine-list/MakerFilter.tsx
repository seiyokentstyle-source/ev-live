"use client";

import { SEGMENT_OFF, SEGMENT_ON } from "@/components/ui/Controls";

type MakerFilterProps = {
  makers: string[];
  value: string;
  favoriteCount: number;
  onChange: (value: string) => void;
};

// 選択中の見た目は詳細ページのタブと共通にする（ページごとに色が変わると別アプリに見える）。
function chipClasses(active: boolean): string {
  return active ? SEGMENT_ON : SEGMENT_OFF;
}

const CHIP_BASE =
  "shrink-0 rounded-md px-3.5 py-2 text-xs font-bold min-h-[36px] whitespace-nowrap";

export function MakerFilter({ makers, value, favoriteCount, onChange }: MakerFilterProps) {
  return (
    /* 横スクロール。両端に余白を持たせて、chip が画面端に貼りつかないようにする。 */
    <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 py-1.5">
      <button
        type="button"
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
        className={`${CHIP_BASE} ${chipClasses(value === "all")}`}
      >
        すべて
      </button>
      <button
        type="button"
        aria-pressed={value === "favorites"}
        onClick={() => onChange("favorites")}
        className={`${CHIP_BASE} ${chipClasses(value === "favorites")}`}
      >
        <span className={value === "favorites" ? "text-favorite" : ""}>★</span> お気に入り
        {favoriteCount > 0 ? (
          <span className="mono ml-1 text-[11px] opacity-80">{favoriteCount}</span>
        ) : null}
      </button>
      {makers.map((maker) => (
        <button
          key={maker}
          type="button"
          aria-pressed={value === maker}
          onClick={() => onChange(maker)}
          className={`${CHIP_BASE} ${chipClasses(value === maker)}`}
        >
          {maker}
        </button>
      ))}
    </div>
  );
}
