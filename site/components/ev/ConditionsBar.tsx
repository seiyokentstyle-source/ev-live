"use client";

import { useState } from "react";
import type { AimMode } from "./ModeSelector";
import type { Machine } from "@/lib/ev/types";

type ConditionsBarProps = {
  machine: Machine;
  mode: AimMode;
  /** 期待値稼働タブで選択中のレート表示（例 "46/52"）。無ければ省略. */
  rateLabel?: string | null;
  /** 期待値稼働タブで選択中の道中CZ状態（例 "CZ0回(天井狙い)"）。無ければ省略. */
  czLabel?: string | null;
  /** 表示中プロファイルの天井表記（例 "1500G"）。無ければ evCalc.ceiling を使う. */
  ceilingText?: string | null;
  /** 表示中プロファイルの当たり件数（通常/リセットでタブごとに違う）。無ければ機種全体を出す. */
  profileSessions?: number | null;
};

type Row = { k: string; v: string };

/** meta.source の先頭にある「実戦データ自動収集（2026-06-09〜2026-07-24・全データ）」から範囲だけ取り出す。 */
function dataRange(source: string): string | null {
  const m = /（([^）]*\d{4}-\d{2}-\d{2}[^）]*)）/.exec(source);
  return m ? m[1] : null;
}

export function ConditionsBar({
  machine,
  mode,
  rateLabel,
  czLabel,
  ceilingText,
  profileSessions
}: ConditionsBarProps) {
  const [open, setOpen] = useState(false);
  const ev = machine.evCalc;
  const range = dataRange(machine.meta.source);
  const calcSpec = machine.calcSpec;

  const rows: Row[] = [];
  if (mode === "ev" && calcSpec) {
    // 算出条件は生成側が組み立てた文字列をそのまま出す（サイトで組み直すと計算とズレるため）。
    // 表示中のタブ/セレクタで変わるものだけ、ここで前後に足す。
    if (rateLabel) rows.push({ k: "レート（表示中）", v: rateLabel });
    if (czLabel) rows.push({ k: "道中CZ（表示中）", v: `${czLabel} の状態から次のボーナスまで` });
    if (ceilingText) rows.push({ k: "天井（表示中のタブ）", v: ceilingText });
    rows.push(...calcSpec.items);
    rows.push({ k: "時給換算", v: `${machine.economics.gamesPerHour}G/時で消化する前提` });
  } else if (mode === "ev" && ev) {
    // 旧データ（calcSpec 未生成）向けのフォールバック。
    if (rateLabel) rows.push({ k: "レート", v: rateLabel });
    rows.push({ k: "賭け枚数", v: `${ev.bet ?? 3}枚掛け` });
    rows.push({ k: "通常時の使用枚数", v: `${ev.use}枚/G（ベース${(50 / ev.use).toFixed(1)}G/50枚）` });
    if (ev.junzou) rows.push({ k: "AT純増", v: `${ev.junzou}枚/G（AT中Gは総獲得÷純増で推定）` });
    rows.push({ k: "天井", v: ceilingText || `${ev.ceiling}G` });
    if (ev.preg) rows.push({ k: "前兆", v: `${ev.preg}G（打ち始めから自力当選しない前提）` });
    if (czLabel) rows.push({ k: "道中CZ", v: `${czLabel} の状態から次のボーナスまで` });
    rows.push({ k: "時給換算", v: `${machine.economics.gamesPerHour}G/時` });
    rows.push({ k: "機械割", v: "回収円÷投資円（46/52なら46枚投資=52枚回収で100%）" });
  } else if (mode === "setting") {
    rows.push({ k: "出率", v: "OUT÷IN（3枚掛け・即やめ想定）" });
    if (ev?.junzou) rows.push({ k: "AT中G", v: `総獲得÷${ev.junzou}枚/G で推定` });
    rows.push({ k: "差枚", v: "グラフ校正があれば優先、無ければ履歴推定" });
    rows.push({ k: "高設定/ブレ", v: "出率100%超の日数 ／ 出率の標準偏差" });
  } else if (mode === "payout") {
    rows.push({ k: "1AT", v: "初当たり〜引き戻し終了の総獲得" });
    rows.push({ k: "当選G帯", v: "0-70 / 71-99 / 以降100Gから50G帯" });
  } else if (mode === "harakiri") {
    const th = machine.harakiri?.threshold;
    if (th) rows.push({ k: "判定", v: `ラッシュ中の1回の当たりで獲得${th}枚以上（推定）` });
    rows.push({ k: "発生率", v: "出たラッシュ ÷ ラッシュ突入回数（1ラッシュ1回・最大100%）" });
  }
  if (range) rows.push({ k: "データ範囲", v: range });
  // サンプルは表示中のタブの母数を出す（meta.samples は機種全体なのでタブによってはズレる）。
  rows.push(
    mode === "ev" && profileSessions
      ? { k: "サンプル", v: `${profileSessions.toLocaleString("ja-JP")}件（表示中のタブ／機種全体 ${machine.meta.samples}件）` }
      : { k: "サンプル", v: `${machine.meta.samples}件` }
  );

  if (rows.length === 0) return null;
  const summary = rows.slice(0, 3).map((r) => r.v.split("（")[0]).join(" / ");

  return (
    <div className="shrink-0 border-b border-line bg-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="mono shrink-0 text-[9px] tracking-[0.14em] text-muted">算出条件</span>
        <span className="mono flex-1 truncate text-[10px] text-ink-soft">{summary}</span>
        <span className="mono shrink-0 text-[10px] text-muted">{open ? "閉じる ▲" : "詳細 ▼"}</span>
      </button>
      {open ? (
        <dl className="mono grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line-soft px-3 py-2 text-[10px]">
          {rows.map((r) => (
            <div key={r.k} className="contents">
              <dt className="whitespace-nowrap text-muted">{r.k}</dt>
              <dd className="text-ink-soft">{r.v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
