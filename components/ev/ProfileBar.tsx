"use client";

import type { Profile } from "@/lib/ev/types";

type ProfileBarProps = {
  profiles: Profile[];
  activeKey: string;
  onChange: (key: string) => void;
};

export function ProfileBar({ profiles, activeKey, onChange }: ProfileBarProps) {
  return (
    <nav className="scrollbar-none flex shrink-0 overflow-x-auto border-b border-line bg-panel">
      {profiles.map((profile) => {
        const active = profile.key === activeKey;
        return (
          <button
            key={profile.key}
            type="button"
            onClick={() => onChange(profile.key)}
            className={`shrink-0 border-b-2 px-4 py-3 text-left text-xs font-bold ${
              active ? "border-highlight text-highlight" : "border-transparent text-ink-soft"
            }`}
          >
            <span>{profile.label}</span>
            <span className="mono block text-[9px] opacity-70">{profile.ceiling}</span>
          </button>
        );
      })}
    </nav>
  );
}
