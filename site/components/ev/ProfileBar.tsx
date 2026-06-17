"use client";

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
    <nav className="scrollbar-none flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-line bg-panel px-2 py-1.5">
      <span className="mono flex shrink-0 items-center pl-1 pr-2 text-[9px] tracking-[0.14em] text-muted">
        狙い方
      </span>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.key)}
            className={`shrink-0 rounded-md border px-3 py-1.5 text-left text-xs font-bold transition-colors ${
              active
                ? "border-highlight bg-[rgba(255,204,68,0.12)] text-highlight"
                : "border-line bg-panel-2 text-ink-soft"
            }`}
          >
            <span>{tab.label}</span>
            <span className="mono block text-[9px] opacity-70">{tab.ceiling}</span>
          </button>
        );
      })}
    </nav>
  );
}
