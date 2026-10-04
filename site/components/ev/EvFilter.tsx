"use client";

import type { FilterAxis } from "@/lib/ev/types";
import { ControlBar, FilterGroup, FilterMultiSelect, FilterSelect } from "@/components/ui/Controls";
import { joinFilterValues, splitFilterValue } from "@/lib/ev/profiles";

type EvFilterProps = {
  /** 絞り込みの軸（データ側が並び順ごと配る）。軸が増えてもここは無改修. */
  axes: FilterAxis[];
  /** 軸key→選択値（未選択は null）. */
  values: Record<string, string | null>;
  onChange: (key: string, value: string | null) => void;
  /** 絞り込み後の台数（実台数の概算）と当たり件数. */
  units?: number;
  hits: number;
  /** hits の単位（『BB間』等）。CZ間天井の表は区間数なのでATと書かない. */
  hitUnit?: string;
  /** 軸key→いま選べる値。生成側は軸の全組み合わせぶんの表を持っていないので、
   *  組み合わせた表が無い選択肢はここから外れる。 */
  enabled?: Record<string, Set<string>>;
  /** 集計行から計算する新形式の表だけ、1軸で複数の値を選べる（区間を足し合わせる）。 */
  multiple?: boolean;
};

export function EvFilter({ axes, values, onChange, units, hits, hitUnit, enabled, multiple }: EvFilterProps) {
  const active = axes.some((axis) => values[axis.key] != null);
  if (axes.length === 0) return null;
  return (
    <ControlBar label="絞り込み" collapsible>
      <FilterGroup>
        {axes.map((axis) => multiple ? (
          <FilterMultiSelect
            key={axis.key}
            label={axis.label}
            allLabel={axis.allLabel}
            options={axis.options.map((option) => option.value)}
            values={splitFilterValue(values[axis.key])}
            onChange={(selected) => onChange(axis.key, joinFilterValues(axis, selected))}
            fmt={(value) => axis.options.find((option) => option.value === value)?.label ?? value}
          />
        ) : (
          <FilterSelect
            key={axis.key}
            label={axis.label}
            allLabel={axis.allLabel}
            options={axis.options.map((option) => option.value)}
            value={values[axis.key] ?? null}
            onChange={(value) => onChange(axis.key, value)}
            fmt={(value) => axis.options.find((option) => option.value === value)?.label ?? value}
            enabled={enabled?.[axis.key]}
          />
        ))}
      </FilterGroup>
      {/* ★件数と「解除」の行は未選択でも場所を取っておき、見えなくするだけにする。
          選んだ瞬間に行が足されると、帯が1行伸びて下の表が押し下げられる。 */}
      <span
        aria-hidden={!active}
        className={`mono flex items-center gap-2 text-[10px] text-muted ${active ? "" : "invisible"}`}
      >
        <span>
          {active
            ? `${units === undefined ? "" : `${units.toLocaleString("ja-JP")}台 / `}${hitUnit ? `${hitUnit}の狙い目` : "狙い目"} ${hits.toLocaleString("ja-JP")}件`
            : "狙い目"}
        </span>
        <button
          type="button"
          tabIndex={active ? undefined : -1}
          onClick={() => axes.forEach((axis) => onChange(axis.key, null))}
          className="rounded-md border border-line bg-panel-2 px-2 py-1 text-[10px] text-ink-soft"
        >
          解除
        </button>
      </span>
    </ControlBar>
  );
}
