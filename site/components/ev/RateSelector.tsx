"use client";

import type { RateOption } from "@/lib/ev/profiles";

type RateSelectorProps = {
  rates: RateOption[];
  value: string | null;
  onChange: (value: string) => void;
};

export function RateSelector({ rates, value, onChange }: RateSelectorProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-3 py-2">
      <span className="mono shrink-0 text-[9px] tracking-[0.14em] text-muted">レート</span>
      <div className="flex gap-1">
        {rates.map((rate) => {
          const active = rate.value === value;
          return (
            <button
              key={rate.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(rate.value)}
              className={`rounded-md border px-3 py-1 text-xs font-bold transition-colors ${
                active
                  ? "border-highlight bg-[rgba(255,204,68,0.12)] text-highlight"
                  : "border-line bg-panel-2 text-ink-soft"
              }`}
            >
              {rate.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
