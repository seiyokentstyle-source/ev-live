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

export function MakerFilter({ makers, value, favoriteCount, onChange }: MakerFilterProps) {
  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto py-1">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors ${chipClasses(value === "all")}`}
      >
        すべて
      </button>
      <button
        type="button"
        onClick={() => onChange("favorites")}
        className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors ${chipClasses(value === "favorites")}`}
      >
        ★ お気に入り{favoriteCount > 0 ? ` (${favoriteCount})` : ""}
      </button>
      {makers.map((maker) => (
        <button
          key={maker}
          type="button"
          onClick={() => onChange(maker)}
          className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors ${chipClasses(value === maker)}`}
        >
          {maker}
        </button>
      ))}
    </div>
  );
}
