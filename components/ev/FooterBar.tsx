"use client";

import type { Profile } from "@/lib/ev/types";

type FooterBarProps = {
  profile: Profile;
  rowCount: number;
  currentG: number;
};

export function FooterBar({ profile, rowCount, currentG }: FooterBarProps) {
  return (
    <footer className="mono flex shrink-0 items-center justify-between border-t border-line bg-panel px-4 py-2 text-[10px] text-muted">
      <div className="flex gap-3">
        <span>
          <span className="text-accent">{profile.gRange.step}G</span> 刻み
        </span>
        <span>
          {rowCount}行 / {profile.gRange.start}〜{profile.gRange.end}G
        </span>
      </div>
      <div className="text-ink-soft">視点: {currentG}G</div>
    </footer>
  );
}
