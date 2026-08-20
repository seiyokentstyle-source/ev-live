"use client";

import { ControlBar, SegmentedControl, type Segment } from "@/components/ui/Controls";

export type AimMode = "ev" | "setting" | "payout" | "harakiri";

type ModeSelectorProps = {
  value: AimMode;
  onChange: (value: AimMode) => void;
  /** 表示するモード（データのあるものだけ親が渡す）. */
  modes: AimMode[];
};

const MODES: Array<Segment<AimMode>> = [
  { value: "ev", label: "期待値稼働", hint: "現在G→期待値" },
  { value: "setting", label: "設定狙い", hint: "台番号別 出率" },
  { value: "payout", label: "AT獲得", hint: "当選G別 平均獲得" },
  { value: "harakiri", label: "ハラキリドライブ", hint: "台番号別 発生率" }
];

export function ModeSelector({ value, onChange, modes }: ModeSelectorProps) {
  return (
    <ControlBar label="目的" scroll>
      <SegmentedControl segments={MODES.filter((mode) => modes.includes(mode.value))} value={value} onChange={onChange} />
    </ControlBar>
  );
}
