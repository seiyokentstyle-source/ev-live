"use client";

import type { ReactNode } from "react";

/**
 * 画面上部に並ぶ操作バーと、その中のボタン/セレクトの見た目を集約する。
 *
 * ★以前は「目的」「狙い方」「レート」「絞り込み」「データ」で見出しの幅が
 *   まちまちだったため、バーごとにボタンの開始位置が左右にズレていた。
 *   見出し幅を固定して縦に揃える。トグルも3種類の書き方が混在していたのを1つにする。
 */

/** 選択中／非選択のボタン配色。タブ・トグル・月タブで共有する。 */
export const SEGMENT_ON = "border-highlight bg-[rgba(255,204,68,0.12)] text-highlight";
export const SEGMENT_OFF = "border-line bg-panel-2 text-ink-soft";

/** 見出し付きの操作バー。scroll=true で折り返さず横スクロール（タブが多い時）。 */
export function ControlBar({
  label,
  children,
  scroll = false
}: {
  label?: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-x-3 border-b border-line bg-panel px-3 py-2">
      {label ? (
        // 幅を固定して、どのバーでも操作部の左端が同じ位置から始まるようにする。
        <span className="mono w-12 shrink-0 text-[9px] leading-tight tracking-[0.14em] text-muted">{label}</span>
      ) : null}
      {/* ★横スクロールするのは操作部だけ。バー全体をスクロールさせると、
          選択中のタブが右にある機種で見出しごと画面外へ流れて消える。 */}
      <div
        className={`flex min-w-0 flex-1 items-center gap-x-3 ${
          scroll ? "scrollbar-none overflow-x-auto" : "flex-wrap gap-y-2"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export type Segment<T extends string> = {
  value: T;
  label: string;
  /** ボタン内の小さい補足（天井Gや用途）。 */
  hint?: string;
};

/** タブ／トグルの共通実装。 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange
}: {
  segments: Array<Segment<T>>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(segment.value)}
            className={`shrink-0 rounded-md border px-3 py-1 text-left text-xs font-bold transition-colors ${
              active ? SEGMENT_ON : SEGMENT_OFF
            }`}
          >
            <span className="block whitespace-nowrap">{segment.label}</span>
            {segment.hint ? (
              <span className="mono block whitespace-nowrap text-[9px] font-normal opacity-70">{segment.hint}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** 絞り込みセレクト。期待値表・設定狙い・ハラキリで同じ物を使う。 */
export function FilterSelect({
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
  onChange: (value: string | null) => void;
  fmt: (value: string) => string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="mono shrink-0 text-[9px] tracking-[0.08em] text-muted">{label}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        className="mono min-w-[124px] rounded-md border border-line bg-panel-2 px-2 py-1 text-[11px] text-ink-soft [color-scheme:dark]"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {fmt(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
