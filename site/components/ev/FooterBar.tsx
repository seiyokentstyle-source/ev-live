"use client";

import type { Profile } from "@/lib/ev/types";
import { TableFoot } from "@/components/ui/DataTable";

type FooterBarProps = {
  profile: Profile;
  rowCount: number;
  currentG: number;
};

export function FooterBar({ profile, rowCount, currentG }: FooterBarProps) {
  return (
    <TableFoot
      left={
        <>
          <span className="text-accent">{profile.gRange.step}G</span> 刻み / {rowCount}行 / {profile.gRange.start}〜
          {profile.gRange.end}G
        </>
      }
      right={
        <>
          {/* firstHitRate は平均ハマりG。確率ではないので 1/X 表記にはしない。 */}
          {profile.firstHitRate ? (
            <span className="mr-3 text-muted">
              平均初当り <span className="text-accent">{profile.firstHitRate.toLocaleString("ja-JP")}G</span>
            </span>
          ) : null}
          視点 <span className="font-bold text-highlight">{currentG.toLocaleString("ja-JP")}G</span>
        </>
      }
    />
  );
}
