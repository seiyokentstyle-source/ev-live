"use client";

type EvFilterProps = {
  tailOptions: string[];
  dayOptions: string[];
  /** 道中CZ回数の候補（AT間区切り機種のみ）。無い機種は undefined でセレクタ非表示. */
  czOptions?: string[];
  /** CZバケット値→表示ラベル（"1"→"CZ1回後" 等）. */
  czLabelFn?: (v: string) => string;
  /** CZセレクタの未選択ラベル（新形式＝CZ0回(天井狙い)。旧形式＝全部）. */
  czAllLabel?: string;
  tail: string | null;
  day: string | null;
  cz?: string | null;
  onTailChange: (v: string | null) => void;
  onDayChange: (v: string | null) => void;
  onCzChange?: (v: string | null) => void;
  /** 絞り込み後の台数（実台数の概算）と当たり件数. */
  units: number;
  hits: number;
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

export function EvFilter({
  tailOptions,
  dayOptions,
  czOptions,
  czLabelFn,
  czAllLabel = "全部",
  tail,
  day,
  cz = null,
  onTailChange,
  onDayChange,
  onCzChange,
  units,
  hits
}: EvFilterProps) {
  const hasCz = Boolean(czOptions && czOptions.length > 0 && onCzChange);
  const active = tail !== null || day !== null || cz !== null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-3 py-2">
      <span className="mono shrink-0 text-[9px] tracking-[0.14em] text-muted">絞り込み</span>
      <Select
        label="末尾"
        allLabel="全部"
        options={tailOptions}
        value={tail}
        onChange={onTailChange}
        fmt={(v) => `末尾${v}`}
      />
      <Select
        label="つく日"
        allLabel="全日"
        options={dayOptions}
        value={day}
        onChange={onDayChange}
        fmt={(v) => `${v}のつく日`}
      />
      {hasCz ? (
        <Select
          label="道中CZ"
          allLabel={czAllLabel}
          options={czOptions ?? []}
          value={cz}
          onChange={onCzChange ?? (() => undefined)}
          fmt={(v) => (czLabelFn ? czLabelFn(v) : v)}
        />
      ) : null}
      {active ? (
        <span className="mono text-[10px] text-muted">
          {units}台 / {hits}AT
          <button
            type="button"
            onClick={() => {
              onTailChange(null);
              onDayChange(null);
              onCzChange?.(null);
            }}
            className="mono ml-2 rounded border border-line px-2 py-0.5 text-[10px] text-ink-soft"
          >
            解除
          </button>
        </span>
      ) : null}
    </div>
  );
}
