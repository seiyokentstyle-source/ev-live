"use client";

// 月タブ（全 + 1月〜12月）。日付列/日付行を持つ表（設定狙い・ハラキリ日付別）で共通利用。
// 12ヶ月ぶん常に出すので、データが年をまたいで増えてもタブ増設は不要（＝拡張性）。
// データに実在する月だけ選択可、それ以外は淡色で無効。

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")); // "01".."12"

/** "2026-06-09" → "06"（月2桁）。 */
export function monthOf(date: string): string {
  const m = /^\d{4}-(\d{2})-\d{2}$/.exec(date);
  return m ? m[1] : "";
}

type MonthTabsProps = {
  /** 全期間の日付（"YYYY-MM-DD"）。実在する月を判定する. */
  dates: string[];
  /** 選択中の月 "MM"。null = 全期間. */
  value: string | null;
  onChange: (m: string | null) => void;
};

export function MonthTabs({ dates, value, onChange }: MonthTabsProps) {
  const present = new Set(dates.map(monthOf).filter(Boolean));
  // 全ボタンを同じ幅に（1桁「7月」と2桁「10月」で幅が変わらないよう固定）。
  const tabClass = (active: boolean, enabled: boolean) =>
    `mono shrink-0 w-11 rounded border py-1 text-center text-[11px] ${
      active
        ? "border-highlight bg-panel-2 text-highlight"
        : enabled
        ? "border-line text-ink-soft"
        : "border-line text-muted opacity-30 cursor-not-allowed"
    }`;

  return (
    // 横スクロール（スライダー）を出さず、はみ出す分は折り返す。
    <div className="flex flex-wrap items-center gap-1">
      <span className="mono w-8 shrink-0 text-[9px] tracking-[0.08em] text-muted">月</span>
      <button type="button" onClick={() => onChange(null)} className={tabClass(value === null, true)}>
        全
      </button>
      {MONTHS.map((mm) => {
        const has = present.has(mm);
        return (
          <button
            key={mm}
            type="button"
            disabled={!has}
            onClick={() => onChange(mm)}
            className={tabClass(value === mm, has)}
          >
            {Number(mm)}月
          </button>
        );
      })}
    </div>
  );
}
