"use client";

export type AimMode = "ev" | "setting";

type ModeSelectorProps = {
  value: AimMode;
  onChange: (value: AimMode) => void;
};

const MODES: Array<{ value: AimMode; label: string; hint: string }> = [
  { value: "ev", label: "期待値稼働", hint: "現在G→期待値" },
  { value: "setting", label: "設定狙い", hint: "台番号別 出率" }
];

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-3 py-2">
      <span className="mono shrink-0 text-[9px] tracking-[0.14em] text-muted">目的</span>
      <div className="flex gap-1">
        {MODES.map((mode) => {
          const active = mode.value === value;
          return (
            <button
              key={mode.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(mode.value)}
              className={`rounded-md border px-3 py-1 text-left text-xs font-bold transition-colors ${
                active
                  ? "border-highlight bg-[rgba(255,204,68,0.12)] text-highlight"
                  : "border-line bg-panel-2 text-ink-soft"
              }`}
            >
              <span>{mode.label}</span>
              <span className="mono block text-[9px] opacity-70">{mode.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
