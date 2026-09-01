"use client";

import { ControlBar, SegmentedControl } from "@/components/ui/Controls";

export type ProfileTab = {
  key: string;
  label: string;
  ceiling: string;
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
        segments={tabs.map((tab) => ({ value: tab.key, label: tab.label, hint: tab.ceiling }))}
        value={activeKey}
        onChange={onChange}
      />
    </ControlBar>
  );
}
