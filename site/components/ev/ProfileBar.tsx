"use client";

import { ControlBar, SegmentedControl } from "@/components/ui/Controls";
import { ceilingHint } from "@/lib/ev/profiles";

export type ProfileTab = {
  key: string;
  label: string;
  ceiling: string;
  /** 2行目を天井表記から読めないとき（リセットの表）に、先に組み立てた2行目。 */
  hint?: string;
};

type ProfileBarProps = {
  tabs: ProfileTab[];
  activeKey: string;
  onChange: (key: string) => void;
};

export function ProfileBar({ tabs, activeKey, onChange }: ProfileBarProps) {
  return (
    <ControlBar label="狙い方" scroll collapsible>
      <SegmentedControl
        segments={tabs.map((tab) => ({ value: tab.key, label: tab.label, hint: (tab.hint ?? ceilingHint(tab.ceiling)) || undefined }))}
        value={activeKey}
        onChange={onChange}
      />
    </ControlBar>
  );
}
