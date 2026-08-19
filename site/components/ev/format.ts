export function formatSigned(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("ja-JP")}`;
}

export function toneClass(value: number): string {
  if (value > 0) return "text-pos";
  if (value < 0) return "text-neg";
  return "text-muted";
}

// 機械割は枚ベース(OUT/IN)なので、色の境目は100%ではなく損益分岐（46/52なら113.0%）。
// breakEven 未指定は等価(100%)扱い＝古いデータでも従来どおりの見た目になる。
export function rtpToneClass(value: number, breakEven = 100): string {
  if (value >= breakEven) return "text-pos";
  return "text-neg";
}
