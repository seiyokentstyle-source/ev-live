"use client";

import { useState, type ReactNode } from "react";

/**
 * 表の見た目をここ1か所に集約する。
 *
 * ★各表がクラス文字列を書き写していると、余白・罫線・文字サイズが表ごとに
 *   少しずつズレて「別のアプリの画面」に見える。実際、期待値表だけ px-1.5、
 *   他は px-2/px-3 になっていた。追加する表もここを使えば自動で揃う。
 */

/** 行の高さ(px)。スクロール位置から表示中のGを割り出すのに使う。 */
export const ROW_HEIGHT = 34;

const HEAD_BASE =
  "sticky top-0 z-20 border-b-2 border-r border-line-soft bg-[#101826] px-2 py-2 text-right text-[10px]";
const CORNER_BASE =
  "sticky left-0 top-0 z-30 whitespace-nowrap border-b-2 border-r border-line bg-[#101826] px-2 py-2 text-left text-[10px] text-ink-soft";
const ROW_HEAD_BASE =
  "sticky left-0 z-10 border-b border-r border-line-soft bg-[#0c131e] px-2 py-2 text-left font-bold text-ink-soft";
const CELL_BASE = "border-b border-r border-line-soft px-2 py-2 text-right";

/** 偶数行の地色。1行おきに敷いて目を横に滑らせやすくする。 */
export function stripe(index: number): string {
  return index % 2 === 1 ? "bg-[var(--row-alt)]" : "";
}

/** 表の外枠（スクロール領域）。数値のコピーを軽く抑止するのも共通の仕事。 */
export function TableScroll({
  children,
  onScroll
}: {
  children: ReactNode;
  /** 期待値表だけ、スクロール位置から「今どのGを見ているか」を親へ伝える。 */
  onScroll?: (scrollTop: number) => void;
}) {
  const block = (event: { preventDefault: () => void }) => event.preventDefault();
  return (
    <div
      className="min-h-0 flex-1 select-none overflow-auto overscroll-contain [-webkit-touch-callout:none]"
      onCopy={block}
      onCut={block}
      onContextMenu={block}
      onScroll={onScroll ? (event) => onScroll(event.currentTarget.scrollTop) : undefined}
    >
      {children}
    </div>
  );
}

/** 見出しセル。unit は単位の副見出し、primary はその表の主役の列。 */
export function Th({
  children,
  unit,
  primary = false,
  corner = false
}: {
  children: ReactNode;
  unit?: string;
  /** その表が答えている問いの列。1つの表で1列だけ強調する。 */
  primary?: boolean;
  /** 左上の角（縦横どちらにも固定される見出し）。 */
  corner?: boolean;
}) {
  return (
    <th className={corner ? CORNER_BASE : `${HEAD_BASE} ${primary ? "text-highlight" : "text-ink-soft"}`}>
      {children}
      {unit ? <span className="block text-[9px] font-normal text-muted">{unit}</span> : null}
    </th>
  );
}

/** 行見出し（左端に固定される列）。sub は台番号の下に出す差枚などの補足。 */
export function RowHead({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <td className={ROW_HEAD_BASE}>
      {children}
      {sub ? <span className="block text-[9px] font-normal leading-tight text-muted">{sub}</span> : null}
    </td>
  );
}

/** 値セル。tone は符号や機械割で決まる色、bold は主役の列。 */
export function Td({
  children,
  tone = "text-ink-soft",
  alt = "",
  bold = false
}: {
  children: ReactNode;
  tone?: string;
  alt?: string;
  bold?: boolean;
}) {
  return <td className={`${CELL_BASE} ${bold ? "font-bold" : ""} ${tone} ${alt}`}>{children}</td>;
}

/**
 * 表の上に出す注記（この表が何を数えたか）。
 *
 * ★既定は1行。開いた注記が4行を占め、「算出条件」バーと同じ内容を二度出していて、
 *   表が画面のずっと下から始まっていた。開閉の見た目は算出条件バーと揃える。
 */
export function TableNote({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass-surface shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2 text-left"
      >
        <span className="mono w-12 shrink-0 text-[9px] tracking-[0.14em] text-muted">見方</span>
        <span className={`min-w-0 flex-1 text-[10px] leading-relaxed text-muted ${open ? "" : "truncate"}`}>
          {children}
        </span>
        <span className="mono shrink-0 text-[10px] text-muted">{open ? "閉じる ▲" : "詳細 ▼"}</span>
      </button>
    </div>
  );
}

/** 表の下に出す合計行。左＝母数、右＝その表の代表値。 */
export function TableFoot({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="glass-surface mono flex shrink-0 items-center justify-between gap-3 px-4 py-2.5 text-[11px]">
      <span className="min-w-0 shrink-0 text-muted">{left}</span>
      {/* 右側は長い出典が入ることがある。shrink-0 のままだと枠から溢れて折り返しが乱れる。 */}
      <span className="min-w-0 text-right text-ink-soft">{right}</span>
    </div>
  );
}

/** データが無いときの表示。表の中でも表の代わりでも同じ見た目にする。 */
export function EmptyState({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-8 py-10 text-center">
      <div>
        {title ? <div className="text-sm font-bold text-neg">{title}</div> : null}
        <p className={`text-xs leading-relaxed text-muted ${title ? "mt-2" : ""}`}>{children}</p>
      </div>
    </div>
  );
}
