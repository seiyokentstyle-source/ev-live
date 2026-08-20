"use client";

import type { FilterAxis } from "@/lib/ev/types";
import { ControlBar, FilterSelect } from "@/components/ui/Controls";

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

export function EvFilter({ axes, values, onChange, units, hits, hitUnit }: EvFilterProps) {
  const active = axes.some((axis) => values[axis.key] != null);
  if (axes.length === 0) return null;
  return (
    <ControlBar label="絞り込み">
      {axes.map((axis) => (
        <FilterSelect
          key={axis.key}
          label={axis.label}
          allLabel={axis.allLabel}
          options={axis.options.map((option) => option.value)}
          value={values[axis.key] ?? null}
          onChange={(value) => onChange(axis.key, value)}
          fmt={(value) => axis.options.find((option) => option.value === value)?.label ?? value}
        />
      ))}
      {active ? (
        <span className="mono flex items-center gap-2 text-[10px] text-muted">
          <span>
            {units.toLocaleString("ja-JP")}台 / {hits.toLocaleString("ja-JP")}
            {hitUnit ? `${hitUnit}区間` : "AT"}
          </span>
          <button
            type="button"
            onClick={() => axes.forEach((axis) => onChange(axis.key, null))}
            className="rounded-md border border-line bg-panel-2 px-2 py-1 text-[10px] text-ink-soft"
          >
            解除
          </button>
        </span>
      ) : null}
    </ControlBar>
  );
}
