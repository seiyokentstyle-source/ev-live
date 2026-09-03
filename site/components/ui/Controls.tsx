"use client";

import type { ReactNode } from "react";

/**
 * 画面上部に並ぶ操作バーと、その中のボタン/セレクトの見た目を集約する。
 *
 * ★以前は「目的」「狙い方」「レート」「絞り込み」「データ」で見出しの幅が
 *   まちまちだったため、バーごとにボタンの開始位置が左右にズレていた。
 *   見出し幅を固定して縦に揃える。トグルも3種類の書き方が混在していたのを1つにする。
 */

/** 選択中／非選択のボタンの面。タブ・トグル・月タブ・メーカーchipで共有する。
 *
 * ★選択中を単色で塗り替えず、ガラスを「少し浮かせて Ice Blue の光を当てる」で表す
 *   （.glass-active）。押下時は逆に沈む。境界線・影・内側ハイライトは
 *   globals.css の primitive 側に集約してあるので、ここでは面の種類だけを指す。 */
export const SEGMENT_ON = "glass-control glass-active text-ink";
export const SEGMENT_OFF = "glass-control text-ink-soft";

/** 見出し付きの操作バー。scroll=true で折り返さず横スクロール（タブが多い時）。 */
export function ControlBar({
  label,
  children,
  scroll = false,
  collapsible = false
}: {
  label?: string;
  children: ReactNode;
  scroll?: boolean;
  /** 表をスクロールしたとき畳むページ共通のバーか。
   *  ★既定は false。表が内側で使う操作バー（集計・月・絞り込み等）まで
   *    畳むと、表を送るたびに表自身の操作が消えてしまう。 */
  collapsible?: boolean;
}) {
  return (
    // ★中身を1枚のdivで包むのは、折りたたみが grid-template-rows を使うため。
    //   grid item が1つでないと 0fr へ潰れない。
    <div className={`glass-surface shrink-0 ${collapsible ? "collapsible-bar" : ""}`}>
      {/* padding を持たない中間層。これが無いと折りたたみが 0 まで縮まない。 */}
      <div>
      <div className="flex items-center gap-x-2 px-3 py-1.5">
      {label ? (
        // 幅を固定して、どのバーでも操作部の左端が同じ位置から始まるようにする。
        <span className="mono w-12 shrink-0 text-[9px] leading-tight tracking-[0.14em] text-muted">{label}</span>
      ) : null}
      {/* ★横スクロールするのは操作部だけ。バー全体をスクロールさせると、
          選択中のタブが右にある機種で見出しごと画面外へ流れて消える。 */}
      <div
        className={`flex min-w-0 flex-1 items-center gap-x-2 ${
          scroll ? "scrollbar-none overflow-x-auto" : "flex-wrap gap-y-2"
        }`}
      >
        {children}
      </div>
      </div>
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
            className={`min-h-[34px] shrink-0 rounded-md px-2.5 py-1 text-left text-xs font-bold ${
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

/** 絞り込みセレクトの入れ物。
 *
 *  ★2列に並べる。軸は機種によって11本まで増える（ヴヴヴ2）。1行1軸だと
 *    絞り込みバーだけで11行ぶんの高さを取り、期待値表が画面外へ押し出される。
 *    2列なら6行で収まる。
 *  ★見出しは選択欄の上に積む。横に並べると『前回CZまでのハマりG』のような
 *    長い軸名が、幅が半分になった列に入らない。 */
export function FilterGroup({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-2 items-end gap-x-2 gap-y-1">{children}</div>
  );
}

/** 絞り込みセレクト。期待値表・設定狙い・ハラキリで同じ物を使う。 */
export function FilterSelect({
  label,
  allLabel,
  options,
  value,
  onChange,
  fmt,
  enabled
}: {
  label: string;
  allLabel: string;
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  fmt: (value: string) => string;
  /** 選べる値。省略時は全部選べる。ここに無い値は
   *  「今の他の軸の選択と組み合わせた表が無い」＝選んでも「データ不足」に
   *  なるだけなので、選択肢として殺す（選べるのに引けない、を作らない）。 */
  enabled?: Set<string>;
}) {
  return (
    // 親は grid-cols-2。1軸ぶんが1セルに収まるよう、見出しを選択欄の上へ積む。
    // 見出しは折り返させる（truncate すると長い軸名が判別できなくなる）。
    <label className="flex min-w-0 flex-col">
      <span className="mono text-[9px] leading-tight tracking-[0.06em] text-muted">{label}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        className="glass-control mono w-full min-w-0 rounded-md px-2 py-1 text-[11px] text-ink-soft [color-scheme:dark]"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => {
          // 今選んでいる値は必ず残す（消すとセレクトの表示が空になる）。
          const ng = enabled != null && !enabled.has(option) && option !== value;
          return (
            <option key={option} value={option} disabled={ng}>
              {fmt(option)}
              {ng ? "（データなし）" : ""}
            </option>
          );
        })}
      </select>
    </label>
  );
}
