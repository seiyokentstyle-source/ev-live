"use client";

import type { ReactNode } from "react";
import { ControlBar, SegmentedControl, type Segment } from "@/components/ui/Controls";

export type AimMode = "ev" | "targets" | "setting" | "payout" | "katana" | "release" | "harakiri" | "conditions";

type ModeSelectorProps = {
  value: AimMode;
  onChange: (value: AimMode) => void;
  /** 表示するモード（データのあるものだけ親が渡す）. */
  modes: AimMode[];
  action?: ReactNode;
};

const MODES: Array<Segment<AimMode>> = [
  { value: "ev", label: "期待値稼働", hint: "現在G→期待値" },
  { value: "targets", label: "狙い目", hint: "追加した条件" },
  { value: "setting", label: "設定狙い", hint: "台番号別 出率" },
  { value: "payout", label: "AT獲得", hint: "当選G別 平均獲得" },
  { value: "katana", label: "刀ポイント", hint: "20円等価の参考試算" },
  { value: "release", label: "穢れ解放", hint: "スルー回数別 解放率" },
  { value: "harakiri", label: "ハラキリドライブ", hint: "台番号別 発生率" },
  // 2026-11-10 利用者指定：以前は目的行の右端の開閉ボタンだった。目的の1ページにする。
  { value: "conditions", label: "算出条件", hint: "計算の前提" }
];

/** 目的の表示名（算出条件のページで、どの表の条件かを示す）。 */
export function aimModeLabel(mode: AimMode): string {
  return MODES.find((item) => item.value === mode)?.label ?? mode;
}

export function ModeSelector({ value, onChange, modes, action }: ModeSelectorProps) {
  return (
    <ControlBar label="目的" collapsible>
      <div className="scrollbar-none min-w-0 flex-1 overflow-x-auto">
        <SegmentedControl segments={MODES.filter((mode) => modes.includes(mode.value))} value={value} onChange={onChange} />
      </div>
      {action}
    </ControlBar>
  );
}
