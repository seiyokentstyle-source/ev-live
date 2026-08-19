export function formatSigned(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("ja-JP")}`;
}

export function toneClass(value: number): string {
  if (value > 0) return "text-pos";
  if (value < 0) return "text-neg";
  return "text-muted";
}

// 機械割は枚ベース(OUT/IN)なので、色の境目は100%ではない。±0になる機械割は
// 行ごとに違う（実測で概ね101〜105%）ため、判定は期待値の符号で行うのが厳密。
// ev 未指定は従来どおり100%を境にする（古いデータ・出率表など用）。
export function rtpToneClass(value: number, ev?: number): string {
  const win = ev === undefined ? value >= 100 : ev >= 0;
  return win ? "text-pos" : "text-neg";
}
