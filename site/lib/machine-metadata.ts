import type { Machine } from "./ev/types";

// Older collector output gave the first SAO the sequel's date and aliases.
// Keep display metadata correct until those JSON files are regenerated.
// Product references: https://www.daitogiken.com/contents/product/slot/sao/
// and https://www.daitogiken.com/contents/product/slot/sao2/
const SAO_METADATA: Record<string, Pick<Machine, "name" | "releaseDate" | "aliases">> = {
  m49d497e0: {
    name: "Lソードアート・オンライン",
    releaseDate: "2023-05-15",
    aliases: ["Lソードアート・オンライン", "SAO", "SAO初代", "ソードアートオンライン"],
  },
  mfb4da289: {
    name: "ソードアート・オンラインII",
    releaseDate: "2026-06-08",
    aliases: ["ソードアート・オンラインII", "SAO2", "SAOⅡ", "SAOII", "ソードアートオンライン2", "ソードアート・オンラインⅡ"],
  },
};

// Aタイプはボーナス抽選が毎ゲーム独立で、ハマりG数ごとの期待値表は意味を持たないので出さない。
// ★データ側を算出保留へ置き換えると「公開済みEVサンプルを算出保留に置き換えた」として
//   data-guard が（[allow-data-regression] でも通さずに）公開を止めるため、表示側で外す。
//   設定狙い（台番号別の推定出率）は意味があるので残す。
export const A_TYPE_NO_EV: Record<string, string> = {
  m2811198e: "パチスロハイパーラッシュ",
  m872598da: "コードギアス反逆のルルーシュ３ C.C.&Kallen ver.",
  m956574c9: "異世界かるてっと",
  mc5a0d9c9: "パチスロひぐらしのなく頃に祭２",
};
export const A_TYPE_PENDING_REASON =
  "Aタイプはボーナス抽選が毎ゲーム独立で、ハマりG数ごとの期待値に差が出ないため期待値表は出していません。設定狙いのタブを使ってください。";

function withoutEvTables(machine: Machine): Machine {
  const {
    theoretical: _theoretical,
    setting1Correction: _setting1Correction,
    savedTargets: _savedTargets,
    atPayout: _atPayout,
    ...rest
  } = machine;
  return {
    ...rest,
    profiles: [{
      key: "a_type_no_ev",
      label: "期待値表なし（Aタイプ）",
      ceiling: "天井なし",
      gRange: { start: 0, end: 0, step: 10 },
      activeAxes: ["rate"],
      baseAnchors: [],
      zones: [],
      dataPending: true,
      pendingReason: A_TYPE_PENDING_REASON,
    }],
  };
}

/** Match both the stable ID and complete name; never match a series substring. */
export function normalizeMachineMetadata(machine: Machine): Machine {
  if (A_TYPE_NO_EV[machine.id] === machine.name) return withoutEvTables(machine);
  const metadata = SAO_METADATA[machine.id];
  if (!metadata || metadata.name !== machine.name) return machine;
  return { ...machine, releaseDate: metadata.releaseDate, aliases: [...metadata.aliases] };
}
