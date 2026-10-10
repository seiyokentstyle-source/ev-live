"use client";

import type { RateOption } from "@/lib/ev/profiles";
import { ControlBar, SegmentedControl } from "@/components/ui/Controls";

type RateSelectorProps = {
  rates: RateOption[];
  value: string | null;
  onChange: (value: string) => void;
  heldMedals?: number;
  onHeldMedalsChange?: (value: number) => void;
};

export function RateSelector({ rates, value, onChange, heldMedals = 0, onHeldMedalsChange }: RateSelectorProps) {
  return (
    <ControlBar label="レート" collapsible>
      <div className="flex min-w-0 items-end gap-2">
      {onHeldMedalsChange ? (
        <label className="mono flex shrink-0 flex-col gap-0.5">
          <span className="text-[9px] leading-tight text-muted">持ちメダル</span>
          <span className="glass-control flex min-h-[34px] items-center gap-1 rounded-md px-2">
            <input
              aria-label="持ちメダル（枚）"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={heldMedals || ""}
              placeholder="0"
              onChange={(event) => {
                const text = event.target.value.normalize("NFKC").replace(/[,\s]/g, "");
                if (!/^\d*$/.test(text)) return;
                const amount = Number(text);
                if (Number.isSafeInteger(amount)) onHeldMedalsChange(amount);
              }}
              className="w-14 min-w-0 bg-transparent text-right text-xs text-ink outline-none placeholder:text-muted focus-visible:ring-1 focus-visible:ring-highlight"
            />
            <span className="text-[10px] text-muted">枚</span>
          </span>
        </label>
      ) : null}
      <SegmentedControl
        segments={rates.map((rate) => ({ value: rate.value, label: rate.label }))}
        value={value ?? rates[0]?.value ?? ""}
        onChange={onChange}
      />
      </div>
    </ControlBar>
  );
}
