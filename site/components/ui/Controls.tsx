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
      <div className="flex items-center gap-x-3 px-3 py-2">
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
            className={`min-h-[36px] shrink-0 rounded-md px-3 py-1.5 text-left text-xs font-bold ${
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

/** 絞り込みセレクトの入れ物。見出し列と選択欄列を揃える。
 *  中の FilterSelect は display:contents なので、この grid の列に直接乗る。 */
export function FilterGroup({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_1fr] items-center gap-x-2 gap-y-2">{children}</div>
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
    // ★display:contents で、見出しと選択欄を親の grid の列へ直接並べる。
    //   見出し幅を固定すると、長い軸名（前回連チャン等）が溢れる一方で
    //   短い軸名では選択欄が無駄に右へ寄る。grid の auto 列なら、
    //   いちばん長い見出しに合わせて全部の左端が自動で揃う。
    <label className="contents">
      <span className="mono whitespace-nowrap text-[9px] leading-tight tracking-[0.08em] text-muted">{label}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        className="glass-control mono w-full min-w-0 rounded-md px-2.5 py-1.5 text-[11px] text-ink-soft [color-scheme:dark]"
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
