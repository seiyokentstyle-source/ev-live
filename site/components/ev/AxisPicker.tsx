"use client";

import { useEffect, useMemo, useState } from "react";
import type { Axis, AxisValue } from "@/lib/ev/types";

type AxisPickerProps = {
  axis: Axis;
  mode: "select" | "pivot";
  value: AxisValue;
  pivotValues: string[];
  onClose: () => void;
  onApplyValue: (value: AxisValue) => void;
  onApplyPivot: (values: string[]) => void;
};

export function AxisPicker({
  axis,
  mode: initialMode,
  value,
  pivotValues,
  onClose,
  onApplyValue,
  onApplyPivot
}: AxisPickerProps) {
  const [mode, setMode] = useState(initialMode);
  const [tempValue, setTempValue] = useState<AxisValue>(value);
  const [tempPivotValues, setTempPivotValues] = useState<string[]>(pivotValues);

  useEffect(() => {
    setMode(initialMode);
    setTempValue(value);
    setTempPivotValues(pivotValues);
  }, [axis.key, initialMode, pivotValues, value]);

  const pivotOptions = useMemo(() => {
    if (axis.type !== "select") return [];
    return axis.options.filter((option) => option.value !== "any");
  }, [axis]);

  function confirm(): void {
    if (axis.type === "number") {
      const raw = Number(tempValue);
      const clamped = Math.min(axis.max, Math.max(axis.min, Number.isFinite(raw) ? raw : axis.default));
      onApplyValue(clamped);
      return;
    }

    if (mode === "pivot") {
      onApplyPivot(tempPivotValues.length > 0 ? tempPivotValues : pivotOptions.map((option) => option.value));
      return;
    }

    onApplyValue(String(tempValue));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={onClose}>
      <div
        className="max-h-[75dvh] w-full max-w-[480px] overflow-hidden rounded-t-2xl border-t border-line bg-panel"
        style={{ animation: "slideUp 180ms ease-out" }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-bold">{axis.label}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center text-xl text-ink-soft">
            x
          </button>
        </header>

        {axis.type === "select" && axis.pivotable ? (
          <div className="flex border-b border-line px-5">
            <button
              type="button"
              onClick={() => setMode("select")}
              className={`mono mr-5 border-b-2 py-3 text-xs ${
                mode === "select" ? "border-accent text-accent" : "border-transparent text-muted"
              }`}
            >
              単一選択
            </button>
            <button
              type="button"
              onClick={() => setMode("pivot")}
              className={`mono border-b-2 py-3 text-xs ${
                mode === "pivot" ? "border-accent text-accent" : "border-transparent text-muted"
              }`}
            >
              ↔ 列展開
            </button>
          </div>
        ) : null}

        <div className="max-h-[50dvh] overflow-y-auto">
          {axis.type === "number" ? (
            <div className="space-y-3 p-5">
              <input
                type="number"
                inputMode="numeric"
                value={Number(tempValue)}
                min={axis.min}
                max={axis.max}
                step={axis.step}
                onChange={(event) => setTempValue(Number(event.target.value))}
                className="mono h-14 w-full rounded-lg border border-line bg-panel-2 text-center text-lg text-ink outline-none focus:border-accent"
              />
              <div className="grid grid-cols-5 gap-2">
                {[0, 100, 300, 500, 1000].map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    onClick={() => setTempValue(quick)}
                    className="mono rounded-md border border-line bg-panel-2 py-2 text-xs text-ink-soft active:bg-[var(--accent-soft)]"
                  >
                    {quick}
                  </button>
                ))}
              </div>
            </div>
          ) : mode === "pivot" ? (
            pivotOptions.map((option) => {
              const selected = tempPivotValues.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setTempPivotValues((current) =>
                      current.includes(option.value)
                        ? current.filter((item) => item !== option.value)
                        : [...current, option.value]
                    )
                  }
                  className={`flex w-full items-center justify-between border-b border-line-soft px-5 py-4 text-sm ${
                    selected ? "bg-[var(--accent-soft)]" : ""
                  }`}
                >
                  <span>{option.label}</span>
                  <span
                    className={`grid h-5 w-5 place-items-center rounded border text-xs ${
                      selected ? "border-accent bg-accent text-white" : "border-line text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                </button>
              );
            })
          ) : (
            axis.options.map((option) => {
              const selected = String(tempValue) === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTempValue(option.value)}
                  className={`flex w-full items-center justify-between border-b border-line-soft px-5 py-4 text-sm ${
                    selected ? "bg-[var(--accent-soft)]" : ""
                  }`}
                >
                  <span>{option.label}</span>
                  <span className={selected ? "text-accent" : "text-transparent"}>✓</span>
                </button>
              );
            })
          )}
        </div>

        <footer className="border-t border-line p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button type="button" onClick={confirm} className="w-full rounded-lg bg-accent py-3 text-sm font-bold text-white">
            適用
          </button>
        </footer>
      </div>
    </div>
  );
}
