export function formatSigned(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("ja-JP")}`;
}

export function toneClass(value: number): string {
  if (value > 0) return "text-pos";
  if (value < 0) return "text-neg";
  return "text-muted";
}

export function rtpToneClass(value: number): string {
  if (value >= 100) return "text-pos";
  return "text-neg";
}
