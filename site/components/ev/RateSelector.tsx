"use client";

import type { RateOption } from "@/lib/ev/profiles";
import { ControlBar, SegmentedControl } from "@/components/ui/Controls";

type RateSelectorProps = {
  rates: RateOption[];
  value: string | null;
  onChange: (value: string) => void;
};

export function RateSelector({ rates, value, onChange }: RateSelectorProps) {
  return (
    <ControlBar label="レート">
      <SegmentedControl
        segments={rates.map((rate) => ({ value: rate.value, label: rate.label }))}
        value={value ?? rates[0]?.value ?? ""}
        onChange={onChange}
      />
    </ControlBar>
  );
}
