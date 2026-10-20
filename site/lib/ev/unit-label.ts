/**
 * 台番号の表示。店舗混合の表では台番号の前に店舗IDが付く（例 "espace_shibuya_shinkan:2252"）。
 * 2026-10-20 利用者指定: 店舗IDのままだと読みにくいので、公開用の店舗名（実名ではない）を
 * 短くした札と番号に分けて見せる。並び・絞り込み・キーは元の文字列のまま使う。
 */
const HALL_SHORT_NAMES: Record<string, string> = {
  shinjuku: "ゴジラ",
  akihabara: "萌えスロ",
  kabuki: "歌舞伎",
  akiba_espace: "電気街口",
  seibu_shinjuku: "西武新宿",
  ueno_honkan: "上野本館",
  ueno_shinkan: "上野新館",
  espace_shibuya_shinkan: "渋谷新館",
  espace_shinkoiwa: "新小岩",
  espace_shinokubo: "新大久保"
};

export type UnitLabel = { hall: string | null; number: string };

export function parseUnitLabel(unit: string): UnitLabel {
  const index = unit.lastIndexOf(":");
  if (index <= 0) return { hall: null, number: unit };
  const hallId = unit.slice(0, index);
  return { hall: HALL_SHORT_NAMES[hallId] ?? hallId, number: unit.slice(index + 1) };
}

/** 台番号末尾の数字（店舗IDの数字は含めない）。 */
export function unitTail(unit: string): string {
  const digits = parseUnitLabel(unit).number.replace(/\D/g, "");
  return digits.length > 0 ? digits.slice(-1) : "";
}
