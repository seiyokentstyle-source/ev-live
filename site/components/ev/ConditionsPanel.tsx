"use client";

import type { Axis, Conditions } from "@/lib/ev/types";

type ConditionsPanelProps = {
  axes: Axis[];
  selection: Conditions;
  pivotAxis: string | null;
  pivotValues: string[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenPicker: (axis: Axis, mode: "select" | "pivot") => void;
};

function axisValueLabel(axis: Axis, selection: Conditions, pivotAxis: string | null, pivotValues: string[]): string {
  if (axis.key === pivotAxis && axis.type === "select") {
    const labels = pivotValues
      .map((value) => axis.options.find((option) => option.value === value)?.label)
      .filter((label): label is string => Boolean(label));
    return labels.length > 0 ? labels.join(" / ") : "値を選択";
  }

  if (axis.type === "number") {
    return `${Number(selection[axis.key] ?? axis.default).toLocaleString("ja-JP")}${axis.suffix ?? ""}`;
  }

  return axis.options.find((option) => option.value === selection[axis.key])?.label ?? String(selection[axis.key] ?? axis.default);
}

export function ConditionsPanel({
  axes,
  selection,
  pivotAxis,
  pivotValues,
  collapsed,
  onToggleCollapsed,
  onOpenPicker
}: ConditionsPanelProps) {
  const activeCount = axes.filter((axis) => {
    const value = selection[axis.key] ?? axis.default;
    if (axis.type === "number") return Number(value) > 0;
    return value !== axis.default && value !== "any";
  }).length;
  const pivotLabel = pivotAxis ? axes.find((axis) => axis.key === pivotAxis)?.label : undefined;

  return (
    <section className="max-h-[50dvh] shrink-0 overflow-y-auto border-b border-line bg-panel">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line-soft bg-panel px-4 py-3">
        <span className="mono text-[10px] tracking-[0.14em] text-muted">▍ 条件</span>
        <span className="mono text-[10px] text-accent">
          {activeCount > 0 ? `${activeCount}件適用中` : ""}
          {pivotLabel ? ` / 列展開: ${pivotLabel}` : ""}
        </span>
        <button type="button" onClick={onToggleCollapsed} className="mono rounded border border-line px-3 py-1 text-[11px] text-ink-soft">
          {collapsed ? "展開" : "折りたたみ"}
        </button>
      </header>

      {!collapsed ? (
        <>
          <div className="mx-4 my-3 border-l-2 border-highlight bg-[rgba(255,204,68,0.06)] px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
            <strong className="mono text-highlight">↔</strong> をタップで <strong className="text-highlight">列展開</strong>。
            複数値を表に並べて比較できる。
          </div>
          <div>
            {axes.map((axis) => {
              const isPivot = pivotAxis === axis.key;
              return (
                <div key={axis.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-line-soft px-4 py-2">
                  <div className="truncate text-xs text-ink-soft">{axis.label}</div>
                  <button
                    type="button"
                    onClick={() => onOpenPicker(axis, isPivot ? "pivot" : "select")}
                    className={`mono min-w-[112px] rounded-md border px-3 py-2 text-center text-xs ${
                      isPivot ? "border-accent bg-[var(--accent-soft)] text-accent" : "border-line bg-panel-2 text-accent"
                    }`}
                  >
                    {axisValueLabel(axis, selection, pivotAxis, pivotValues)}
                  </button>
                  <button
                    type="button"
                    disabled={!axis.pivotable}
                    aria-label={`${axis.label}を列展開`}
                    onClick={() => onOpenPicker(axis, "pivot")}
                    className={`mono grid h-[30px] w-9 place-items-center rounded-md border text-xs font-bold ${
                      isPivot
                        ? "border-highlight bg-highlight text-black"
                        : axis.pivotable
                          ? "border-line text-muted"
                          : "border-line text-muted opacity-30"
                    }`}
                  >
                    ↔
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
