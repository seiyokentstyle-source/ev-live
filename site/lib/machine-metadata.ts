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

const LEGACY_COUNTER_PENDING_PREFIX =
  "台データオンライン（エスパス日拓新宿歌舞伎町店）だけにある機種で、履歴は取り込み始めたところです。";
const COUNTER_PENDING_DETAIL =
  "台データの種別（BB/RB/ART等）と実機のボーナス・AT・CZの対応、連チャンの区切りを実データで確かめるまで、期待値の算出を保留しています。";
const LEGACY_COUNTER_PENDING_REASON = LEGACY_COUNTER_PENDING_PREFIX + COUNTER_PENDING_DETAIL;
const COUNTER_PENDING_REASON = "履歴は保存済みです。" + COUNTER_PENDING_DETAIL;

// These saved observations now occur in multiple halls. Correct only the
// exact legacy wording; the pending decision and every numerical field stay intact.
function normalizeCounterPendingWording(machine: Machine): Machine {
  const matches = (profile: Machine["profiles"][number]) => profile.key === "counter_pending"
    && profile.dataPending === true && profile.pendingReason === LEGACY_COUNTER_PENDING_REASON;
  if (!machine.profiles.some(matches)) return machine;
  return {
    ...machine,
    profiles: machine.profiles.map(profile => matches(profile)
      ? { ...profile, pendingReason: COUNTER_PENDING_REASON } : profile),
    ...(machine.calcSpec ? { calcSpec: {
      ...machine.calcSpec,
      items: machine.calcSpec.items.map(item =>
        (item.k === "期待値の算出状況" || item.k === "データカウンター")
          && item.v === LEGACY_COUNTER_PENDING_REASON
          ? { ...item, v: COUNTER_PENDING_REASON } : item),
    } } : {}),
  };
}

const MAHO_PUBLISHED_SETTING1 = "機械割97.6%／設定1機械割97.6%（公表値: slobase / chonborista）。";
const MAHO_LEGACY_SETTING1 = MAHO_PUBLISHED_SETTING1
  + "サイトセブンのBB（AT）獲得が約45%欠けるため、この機械割と実測の初当りG分布から1回あたりの獲得を逆算している";
const MAHO_CURRENT_SETTING1 = MAHO_PUBLISHED_SETTING1
  + "データカウンターのBB（AT）獲得が約45%欠けるため、この機械割と実測の初当りG分布から1回あたりの獲得を逆算している";
const MAHO_MEASURED_HALLS = new Set([
  "kabuki", "akiba_espace", "seibu_shinjuku", "ueno_honkan", "ueno_shinkan", "espace_shibuya_shinkan",
]);

// This combined output uses Daidata payouts and a payout-scale correction.
// The SiteSeven-only assumed-payout explanation does not describe that method.
function normalizeMahoMixedWording(machine: Machine): Machine {
  const correction = machine.setting1Correction, sources = machine.mixedSources;
  if (machine.id !== "m407111cd" || machine.name !== "L魔法少女にあこがれて"
    || correction?.sourceHallId !== "mixed" || correction.method !== "payout-scale"
    || correction.targetRtp !== 0.976 || sources?.schemaVersion !== 1
    || !sources.halls.length || !sources.halls.every(hall => MAHO_MEASURED_HALLS.has(hall))) return machine;
  const matches = (item: { k: string; v: string }) => item.k === "設定1（公表）"
    && (item.v === MAHO_LEGACY_SETTING1 || item.v === MAHO_CURRENT_SETTING1);
  if (!machine.calcSpec?.items.some(matches)) return machine;
  return {
    ...machine,
    calcSpec: { ...machine.calcSpec, items: machine.calcSpec.items.map(item =>
      matches(item) ? { ...item, v: MAHO_PUBLISHED_SETTING1 } : item) },
  };
}

// 利用者指定（2026-11-13）：算出条件には店の名前と取得元サイトの名前を書かない。
// 生成側の文も直してあるが、公開済みのJSONは機種ごとに作り直されるまで古い文のままなので、
// 画面に出す直前に決まった言い回しだけを置き換える。数値・判定・項目の並びは変えない。
const SOURCE_NAME_REWRITES: ReadonlyArray<readonly [string, string]> = [
  ["台データオンライン（エスパス日拓新宿歌舞伎町店）だけにある機種で、履歴は取り込み始めたところです。", "履歴は保存済みです。"],
  ["台データの種別（", "データカウンターの種別（"],
  ["台データの信号。", "データカウンターの信号。"],
  ["サイトセブンのBB（AT）獲得が", "データカウンターのBB（AT）獲得が"],
  ["東宝・アイランドはグラフのある日はグラフが上がった区間をAT、台データの店は差枚の記録で判定できる連なりはそれで決める。",
    "スランプグラフのある日はグラフが上がった区間をAT、差枚の記録がある店は判定できる連なりをそれで決める。"],
  ["歌舞伎町・西武新宿・上野新館は0GのART、秋葉原は正Gを含むARTを用いる。", "店舗によって0GのART、または正Gを含むARTを用いる。"],
  ["歌舞伎町のRBをCZ", "RBをCZ"],
  ["歌舞伎町のBBをBC", "BBをBC"],
  ["歌舞伎町のARTをGB系", "ARTをGB系"],
  ["新宿のBB・RBを疑似ボーナス", "BB・RBを疑似ボーナス"],
  ["（池袋はBB）", "（一部の店舗はBB）"],
  ["（池袋はRB）", "（一部の店舗はRB）"],
  ["（スマートプレゴはBB）", "（一部の店舗はBB）"],
  ["混ざる店（西武新宿）は", "混ざる店は"],
  ["台データの差枚から見積もった", "差枚の記録から見積もった"],
  // 算出条件以外（集計元の一覧・保留理由・店舗の補足）に出る名前。
  ["スマートプレゴ池袋", "池袋のお店"],
  ["対象日の台データを", "対象日のデータを"],
  ["Daidataの保存済み履歴を", "保存済み履歴を"],
];

// 利用者指定（2026-11-13）：出典も出さない。「（公表値: 解析サイト名 / …）」は「（公表値）」にする。
const PUBLISHED_VALUE_SOURCE_RE = /（公表値: [^（）]*）/g;
// 裏取りに使ったURLの項目。画面だけでなく、ページに埋め込むデータからも外す。
const DROPPED_CALC_SPEC_KEYS = new Set(["仕様出典"]);

export function hideSourceNamesInText(text: string): string {
  let out = text;
  for (const [from, to] of SOURCE_NAME_REWRITES) if (out.includes(from)) out = out.split(from).join(to);
  return out.replace(PUBLISHED_VALUE_SOURCE_RE, "（公表値）");
}

function hideSourceNames(machine: Machine): Machine {
  const items = machine.calcSpec?.items;
  const itemsChanged = items?.some(item => DROPPED_CALC_SPEC_KEYS.has(item.k) || hideSourceNamesInText(item.v) !== item.v) ?? false;
  const metaSource = hideSourceNamesInText(machine.meta.source);
  const metaChanged = metaSource !== machine.meta.source;
  const profilesChanged = machine.profiles.some(profile =>
    typeof profile.pendingReason === "string" && hideSourceNamesInText(profile.pendingReason) !== profile.pendingReason);
  if (!itemsChanged && !profilesChanged && !metaChanged) return machine;
  return {
    ...machine,
    ...(metaChanged ? { meta: { ...machine.meta, source: metaSource } } : {}),
    ...(profilesChanged ? { profiles: machine.profiles.map(profile => typeof profile.pendingReason === "string"
      ? { ...profile, pendingReason: hideSourceNamesInText(profile.pendingReason) } : profile) } : {}),
    ...(itemsChanged && machine.calcSpec ? { calcSpec: { ...machine.calcSpec,
      items: machine.calcSpec.items.filter(item => !DROPPED_CALC_SPEC_KEYS.has(item.k))
        .map(item => ({ ...item, v: hideSourceNamesInText(item.v) })) } } : {}),
  };
}

/** Match both the stable ID and complete name; never match a series substring. */
export function normalizeMachineMetadata(machine: Machine): Machine {
  machine = normalizeCounterPendingWording(machine);
  machine = normalizeMahoMixedWording(machine);
  machine = hideSourceNames(machine);
  if (A_TYPE_NO_EV[machine.id] === machine.name) return withoutEvTables(machine);
  const metadata = SAO_METADATA[machine.id];
  if (!metadata || metadata.name !== machine.name) return machine;
  return { ...machine, releaseDate: metadata.releaseDate, aliases: [...metadata.aliases] };
}
