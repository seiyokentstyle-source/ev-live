"use client";

import type { FilterAxis } from "@/lib/ev/types";

type EvFilterProps = {
  /** 絞り込みの軸（データ側が並び順ごと配る）。軸が増えてもここは無改修. */
  axes: FilterAxis[];
  /** 軸key→選択値（未選択は null）. */
  values: Record<string, string | null>;
  onChange: (key: string, value: string | null) => void;
  /** 絞り込み後の台数（実台数の概算）と当たり件数. */
  units: number;
  hits: number;
  /** hits の単位（『BB間』等）。CZ間天井の表は区間数なのでATと書かない. */
  hitUnit?: string;
};

function Select({
  label,
  allLabel,
  options,
  value,
  onChange,
  fmt
}: {
  label: string;
  allLabel: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
  fmt: (v: string) => string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="mono shrink-0 text-[9px] tracking-[0.08em] text-muted">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="mono min-w-[128px] rounded border border-line bg-panel-2 px-2 py-1 text-[11px] text-ink-soft [color-scheme:dark]"
      >
        <option value="">{allLabel}</option>
        {options.map((v) => (
          <option key={v} value={v}>
            {fmt(v)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EvFilter({ axes, values, onChange, units, hits, hitUnit }: EvFilterProps) {
  const active = axes.some((axis) => values[axis.key] != null);
  if (axes.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-3 py-2">
      <span className="mono shrink-0 text-[9px] tracking-[0.14em] text-muted">絞り込み</span>
      {axes.map((axis) => (
        <Select
          key={axis.key}
          label={axis.label}
          allLabel={axis.allLabel}
          options={axis.options.map((option) => option.value)}
          value={values[axis.key] ?? null}
          onChange={(v) => onChange(axis.key, v)}
          fmt={(v) => axis.options.find((option) => option.value === v)?.label ?? v}
        />
      ))}
      {active ? (
        <span className="mono text-[10px] text-muted">
          {units}台 / {hits}
          {hitUnit ? `${hitUnit}区間` : "AT"}
          <button
            type="button"
            onClick={() => axes.forEach((axis) => onChange(axis.key, null))}
            className="mono ml-2 rounded border border-line px-2 py-0.5 text-[10px] text-ink-soft"
          >
            解除
          </button>
        </span>
      ) : null}
    </div>
  );
}
