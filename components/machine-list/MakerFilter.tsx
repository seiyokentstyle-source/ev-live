"use client";

type MakerFilterProps = {
  makers: string[];
  value: string;
  favoriteCount: number;
  onChange: (value: string) => void;
};

function chipClasses(active: boolean, favorite = false): string {
  if (favorite && active) {
    return "border-highlight bg-highlight text-black";
  }
  if (active) {
    return "border-accent bg-[var(--accent-soft)] text-accent";
  }
  return "border-line bg-panel-2 text-ink-soft";
}

export function MakerFilter({ makers, value, favoriteCount, onChange }: MakerFilterProps) {
  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto py-1">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={`mono shrink-0 rounded-full border px-3 py-2 text-xs ${chipClasses(value === "all")}`}
      >
        すべて
      </button>
      <button
        type="button"
        onClick={() => onChange("favorites")}
        className={`mono shrink-0 rounded-full border px-3 py-2 text-xs ${chipClasses(value === "favorites", true)}`}
      >
        ★ お気に入り{favoriteCount > 0 ? ` (${favoriteCount})` : ""}
      </button>
      {makers.map((maker) => (
        <button
          key={maker}
          type="button"
          onClick={() => onChange(maker)}
          className={`mono shrink-0 rounded-full border px-3 py-2 text-xs ${chipClasses(value === maker)}`}
        >
          {maker}
        </button>
      ))}
    </div>
  );
}
