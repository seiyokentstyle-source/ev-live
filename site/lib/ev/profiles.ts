import type { AimKind, DecodedFilterAggregation, EvFilterTable, FilterAxis, Profile } from "./types";
import { aggregateFilterTable, type AggregateFilterTable } from "./filter-aggregation";

// Machine JSON ships one profile per (狙い方 × レート) combination. Rate variants
// share a base key/label and differ only by a suffix:
//   key:   `<base>_4652` / `<base>_5050`
//   label: contains `・46/52` / `・50/50`
// The UI presents the 狙い方 as tabs (one per base) and the レート as a selector.
// Profiles without a rate suffix are treated as their own single-variant group
// so legacy/old-format JSON keeps working unchanged.

export type RateOption = {
  value: string;
  label: string;
};

export type ProfileGroup = {
  /** Base key with the rate suffix removed (the tab identity). */
  key: string;
  aimKind?: AimKind;
  /** Base label with the rate token removed (the tab text). */
  label: string;
  ceiling: string;
  /** Profile keyed by rate value ("4652" / "5050"), or SINGLE for unsuffixed. */
  variants: Record<string, Profile>;
  /** Profiles in the order they appeared, for fallback resolution. */
  order: Profile[];
};

export type GroupedProfiles = {
  groups: ProfileGroup[];
  /** Available rates across all profiles, empty when no profile is rate-suffixed. */
  rates: RateOption[];
  defaultRate: string | null;
};

const RATE_META: Record<string, { label: string; order: number }> = {
  "4652": { label: "46/52", order: 0 },
  "5050": { label: "50/50（等価）", order: 1 }
};

const RATE_KEY_RE = /_(4652|5050)$/;
const RATE_LABEL_RE = /・(?:46\/52|50\/50)/g;
// 旧データのラベルに焼き込まれた「（n=◯◯）」を表示から除去する。サンプル件数は
// EvTable の「サンプル数」列（baseAnchors[].n）に一本化したため、ラベル側の重複表記は出さない。
const SAMPLE_SUFFIX_RE = /（n=\d+）/g;
// 表記名の正規化。文言の言い換えはデータ再生成を待たずここで即時反映する
// （数値はデータが正・文言はサイトが正、という役割分担）。データ側の生成文言が
// 追いついたら各ルールは実質no-opになるが、旧JSONが残っても表示は常に新表記になる。
// ★見出しは「どの狙い方か」が分かれば足りる。測り方の断り（実測/実G実測）や
//   「固定G天井なし」は算出条件タブで読めるので、タブ名からは落とす。
//   数字（液晶1000G・900pt・999まいる等）は狙い方の識別に要るので残す。
//   上から順に適用するので、長い特例を先に置くこと。
const LABEL_REWRITES: Array<[RegExp, string]> = [
  [/据え置き/g, "通常"],
  // 測り方の断り。数字を持つものは数字だけ残す
  [/（950pt仕様・横軸は実G実測）/g, "（950pt）"],
  [/（リセット時 液晶カウンタ500（実G目安約370〜400G））/g, "（リセ500）"],
  [/（([^（）]+)・実G実測）/g, "（$1）"],
  [/（([^（）]+)・実測）/g, "（$1）"],
  [/（実G実測）/g, ""],
  [/（実測）/g, ""],
  // 数字を持たない断りは丸ごと落とす（「〜間」の時点で天井が無いのは伝わる）
  [/（(?:固定G天井なし|G数天井なし|天井なし)）/g, ""],
  [/（前回種別で(\d+\/\d+G)）/g, "（$1）"],
  [/だけ打つ/g, ""],
  // 「設定1想定」は低設定想定店舗混合のタブにしか出ない（店舗別からは
  // lib/ev/low-setting.ts が外している）。その店舗名がヘッダーに出ているので、
  // タブ名で毎回名乗らない。主表の双子は「◯◯間天井期待値」になる。
  // ★振り分けは生のラベル（low-setting.ts）で見るので、ここで落としても壊れない。
  [/（設定1想定）/g, "期待値"],
  [/（設定1想定・([^（）]+)）/g, "（$1）"],
  // 生成側が リセットCZ間天井 を出すようになると「CZ間（リセット時 3周期）」に変わる。
  // タブ名は通常時と揃えて「CZ間天井」にし、3周期は2行目（天井表記）で出す。
  [/CZ間（リセット時 3周期）/g, "CZ間天井"],
  // 打ち方と朝一の言い回しを詰める
  [/リセット時 /g, "リセ"],
  [/1回でやめ/g, "1回"],
  [/朝一リセット想定/g, "リセ"],
  [/リセット想定/g, "リセット"],
  // 「通常」は既定の狙い方なので書かない（他と並んだときだけ意味を持つ語）
  [/・通常）/g, "）"],
  [/（通常）/g, ""],
  // ヴヴヴ2。区切りはBBとRBなので「AT・RB」ではなく「BB・RB」。
  // 2番目は「BBまでツッパ」を2行目へ回し、名前は短くする。
  // ★「・通常）」を落とした後に当てるのでこの位置（順序依存）。
  [/AT・RB間天井/g, "BB・RB間天井"],
  [/BB間天井（BBまでツッパ）/g, "BB間天井期待値"],
  // 引き戻しは「狙い」で伝わる。何G打つかは2行目に出る。
  [/引き戻しゾーン（AT後\d+G）/g, "引き戻し狙い"],
  // 空になった括弧と余った空白を掃除
  [/（\s*）/g, ""],
  [/\s{2,}/g, " "]
];
// 天井表記（タブのhintと「天井」行）も同じ扱い。算出条件タブに同じことが
// 書いてあるものは出さない。
// ★「リセット仕様：…」は calcSpec の「リセット仕様」と文字列が同一の重複。
//   落とすと ConditionsBar が evCalc.ceiling（数値）へ自動で退避する。
// ★引き戻しゾーンの「当選したらその連チャンを消化してやめ」は言わなくても分かる。
const CEILING_REWRITES: Array<[RegExp, string]> = [
  [/／当選したらその連チャンを消化してやめ/g, ""],
  [/^リセット仕様：.*$/, ""],
  // リセット天井は数字だけでよい。内訳は算出条件に出る。
  [/^(リセット天井 \d+G)／.*$/, "$1"],
  [/^AT終了から(\d+G)$/, "AT後$1"],
  [/／他種別は流して(.+?)まで$/, "／$1までツッパ"]
];

// 機種ごとの天井表記の上書き。
// ★ヴヴヴ2の cz_reset は、リセット後の表なのに通常時の「CZ間 999G」が入っていた。
//   生成側（ev_calc の リセットCZ間天井='3周期'）を直したので、再生成後は
//   「CZ間 3周期」になる。どちらの表記でも朝一の表だと分かるよう
//   「リセット天井 3周期」に揃える（4番の朝一タブと同じ言い回し）。
const CEILING_OVERRIDES: Record<string, Record<string, string>> = {
  vvv2: { cz_reset: "リセット天井 3周期" }
};

/** 天井表記。算出条件で読めることは出さない。 */
export function rewriteCeiling(text: string, machineId?: string, profileKey?: string): string {
  const override = machineId && profileKey ? CEILING_OVERRIDES[machineId]?.[profileKey] : undefined;
  if (override !== undefined) return override;
  let out = text ?? "";
  for (const [from, to] of CEILING_REWRITES) out = out.replace(from, to);
  return out.trim();
}

// 絞り込み軸の見出しも同じ扱い。軸のラベルはデータ側（evFilters.axes）が配るので、
// 生成側だけ直しても夜間の再生成まで古い文言が出続ける。ここを通して即時に反映する。
// ★選択肢（「3のつく日」＝3/13/23）は言い換えない。「3の特定日」では意味が通らず、
//   「3の日」だと3日だけに読めてしまうため、見出しだけを特定日にする。
const AXIS_LABEL_REWRITES: Array<[RegExp, string]> = [
  [/^つく日$/, "特定日"]
];

// メーカー名も同じ扱い。生成側（777site-scraper の make_evlive_data.機種情報）に
// 登録しても、機種JSONへ載るのは夜間の再生成後なので、それまで「未登録」が出続ける。
// ここを通して即時に反映する。
//
// ★データが「未登録」のときだけ差し替える。夜間の再生成でJSONに正しい値が入れば、
//   この表は自動的に素通りになる（データが正・ここは繋ぎ、という関係を壊さない）。
// ★キーは機種名の部分一致で、上から順に先勝ち。生成側と同じ並びにしてあるので、
//   片方だけ直すとズレる。直すときは両方。
//   - 「吉宗」は「L真打吉宗」も拾うため必ず最後
//   - 「革命機ヴァルヴレイヴ」はヴヴヴ2も拾うため「ロ革命機ヴァルヴレイヴ」にする
const MANUFACTURER_REWRITES: Array<[string, string]> = [
  ["ULTRAMAN", "オッケー."],
  ["アズールレーン", "京楽産業."],
  ["やじきた", "ユニバーサルブロス"],
  ["ゾンビランドサガ", "大都技研"],
  ["ロ革命機ヴァルヴレイヴ", "SANKYO"],
  ["喰霊", "オーイズミ"],
  ["コードギアス", "Sammy"],
  ["ストリートファイター", "レオスター"],
  ["ひぐらし", "オーイズミ"],
  ["ハイパーラッシュ", "セブンリーグ"],
  ["かるてっと", "Sammy"],
  ["邪神ちゃん", "三洋物産"],
  ["転生の章", "Sammy"],
  ["禁書目録", "藤商事"],
  ["かぐや様", "SANKYO"],
  ["タクトオーパス", "平和"],
  ["チバリヨ", "ネット"],
  ["デビルメイクライ", "アデリオン"],
  ["南国育ち", "平和"],
  ["超電磁砲", "藤商事"],
  ["シャーマンキング", "エレコ"],
  ["モンスターハンター", "エンターライズ"],
  ["化物語", "Sammy"],
  ["グランベルム", "北電子"],
  ["戦国コレクション", "コナミアミューズメント"],
  ["吉宗", "大都技研"]
];

// メーカー名の表記ゆれ。同じメーカーが2つの綴りで入ると、メーカー絞り込みの
// chip が割れて別会社のように見える（'Sammy' と 'サミー' で実際に割れていた）。
// ★こちらは「未登録」でなくても常に通す。既にJSONへ載っている表記も寄せるため。
const MANUFACTURER_ALIASES: Record<string, string> = {
  サミー: "Sammy"
};

/** メーカー名。「未登録」なら機種名から補い、表記ゆれは1つに寄せて返す。 */
export function rewriteManufacturer(name: string, manufacturer: string): string {
  let out = manufacturer;
  if (out === "未登録") {
    const hit = MANUFACTURER_REWRITES.find(([key]) => name.includes(key));
    if (hit) out = hit[1];
  }
  return MANUFACTURER_ALIASES[out] ?? out;
}

/** 軸の見出しを現在の表記に直して返す。中身（key/options）はデータのまま. */
export function rewriteAxisLabel(label: string): string {
  let out = label;
  for (const [from, to] of AXIS_LABEL_REWRITES) out = out.replace(from, to);
  return out;
}

// 算出条件に出さない項目。文言の言い換えと同じ扱いで、データ再生成を待たず
// ここで即時に反映する。
// ★「仕様出典」はスペックの裏取りに使ったURLで、読む人が期待値を判断する材料では
//   ない。生成側（777site-scraper の ev_calc.py）は記録として持ち続けるが、
//   画面には出さない。生成側だけ直すと夜間の再生成まで古い表示が残る。
const HIDDEN_CALC_SPEC_KEYS = new Set(["仕様出典"]);

/** 算出条件のうち画面に出す項目だけを返す。並びと中身はデータのまま. */
export function visibleCalcSpecItems<T extends { k: string }>(items: T[]): T[] {
  return items.filter((item) => !HIDDEN_CALC_SPEC_KEYS.has(item.k));
}

const SINGLE = "_single";

function parseProfile(profile: Profile): { baseKey: string; baseLabel: string; rate: string | null } {
  let cleanLabel = profile.label.replace(SAMPLE_SUFFIX_RE, "");
  // 分類付きの表は生成側が機種仕様に合わせた名称を配る。旧表だけを言い換える。
  if (!profile.aimKind) for (const [from, to] of LABEL_REWRITES) cleanLabel = cleanLabel.replace(from, to);
  const match = RATE_KEY_RE.exec(profile.key);
  if (!match) {
    return { baseKey: profile.key, baseLabel: cleanLabel.trim(), rate: null };
  }
  return {
    baseKey: profile.key.slice(0, match.index),
    baseLabel: cleanLabel.replace(RATE_LABEL_RE, "").trim(),
    rate: match[1]
  };
}

/** 同じ母集団を分けた狙い方が揃った場合だけ、重複する旧通常表を外す。 */
function replacedByRunthroughGroups(group: ProfileGroup, groups: Map<string, ProfileGroup>): boolean {
  if (group.aimKind) return false;
  const replacements: Array<[string, AimKind]> = group.key === "game_ceiling"
    ? [["game_ceiling_after_nonrunthrough", "at_non_runthrough"],
       ["game_ceiling_after_runthrough", "at_runthrough"]]
    : group.key === "game_ceiling_joui"
      ? [["game_ceiling_after_nonrunthrough_joui", "at_non_runthrough"]]
      : [];
  if (replacements.length === 0) return false;

  return Object.entries(group.variants).every(([rate, original]) => {
    if (!Number.isInteger(original.sessions) || original.sessions! <= 0) return false;
    let sessions = 0;
    for (const [key, aimKind] of replacements) {
      const replacement = groups.get(key)?.variants[rate];
      if (!replacement || replacement.aimKind !== aimKind || replacement.dataPending || replacement.pendingReason
          || replacement.baseAnchors.length === 0
          || !Number.isInteger(replacement.sessions) || replacement.sessions! <= 0) return false;
      sessions += replacement.sessions!;
    }
    // 判別不能な前回状態や、まだ表がない交換条件を黙って落とさない。
    return sessions === original.sessions;
  });
}

const KABANERI_ST_AIMS: Record<string, { label: string; order: number }> = {
  game_ceiling_after_nonrunthrough: { label: "駆け抜け以外後", order: 0 },
  game_ceiling_after_runthrough: { label: "駆け抜け後", order: 1 },
  game_ceiling_after_nonrunthrough_joui: { label: "上位後", order: 2 },
  game_ceiling_joui: { label: "上位後", order: 2 },
  reset: { label: "リセット", order: 3 }
};

/** 海門決戦はST間を前回状態で選ぶ。ボーナス1回で区切る別の打ち方は並べない。 */
function machineAimGroups(groups: ProfileGroup[], machineId?: string): ProfileGroup[] {
  if (machineId !== "mcd43a818") return groups;
  const selected = groups.filter(group => !["cz_ceiling", "cz_s1", "cz_reset"].includes(group.key));
  // 古いデータに道中表しかない場合も、機種ページを空にしない。
  if (selected.length === 0) return groups;
  return selected.map(group => ({ ...group, label: KABANERI_ST_AIMS[group.key]?.label ?? group.label }))
    .sort((a, b) => (KABANERI_ST_AIMS[a.key]?.order ?? 4) - (KABANERI_ST_AIMS[b.key]?.order ?? 4));
}

export function groupProfiles(profiles: Profile[], machineId?: string): GroupedProfiles {
  const order: string[] = [];
  const map = new Map<string, ProfileGroup>();
  const rateSet = new Set<string>();

  for (const profile of profiles) {
    const { baseKey, baseLabel, rate } = parseProfile(profile);
    if (rate) rateSet.add(rate);

    let group = map.get(baseKey);
    if (!group) {
      group = { key: baseKey, aimKind: profile.aimKind, label: baseLabel,
        ceiling: profile.aimKind ? profile.ceiling : rewriteCeiling(profile.ceiling, machineId, baseKey), variants: {}, order: [] };
      map.set(baseKey, group);
      order.push(baseKey);
    }
    group.order.push(profile);
    group.variants[rate ?? SINGLE] = profile;
  }

  const rates = [...rateSet]
    .sort((a, b) => (RATE_META[a]?.order ?? 99) - (RATE_META[b]?.order ?? 99))
    .map((value) => ({ value, label: RATE_META[value]?.label ?? value }));
  const defaultRate = rates.find((rate) => rate.value === "4652")?.value ?? rates[0]?.value ?? null;

  const aimOrder: Record<AimKind, number> = { cz: 0, bonus: 1, at_non_runthrough: 2, at_runthrough: 3 };
  const groups = order.map((key) => map.get(key) as ProfileGroup)
    .filter(group => !replacedByRunthroughGroups(group, map));
  groups.sort((a, b) => (a.aimKind ? aimOrder[a.aimKind] : 4) - (b.aimKind ? aimOrder[b.aimKind] : 4));
  return { groups: machineAimGroups(groups, machineId), rates, defaultRate };
}

export function resolveProfile(group: ProfileGroup, rate: string | null): Profile {
  if (rate && group.variants[rate]) return group.variants[rate];
  if (group.variants[SINGLE]) return group.variants[SINGLE];
  return group.order[0];
}

export type FilterSelection = Record<string, string | null>;

/** 宣言された軸・値だけで、生成側と同じ順序の完全一致キーを作る。 */
export function filterSelectionKey(axes: FilterAxis[], selection: FilterSelection): string | null {
  const known = new Set(axes.map(axis => axis.key));
  if (Object.entries(selection).some(([key, value]) => value != null && !known.has(key))) return null;
  let key = "";
  for (const axis of axes) {
    const value = selection[axis.key];
    if (value == null) continue;
    if (!axis.options.some(option => option.value === value)) return null;
    key += `${axis.key}${value}`;
  }
  return key;
}

/** 省略可能な各軸を順に読んで、表キーが一意な指定条件へ戻せるか確認する。 */
export function isExactFilterTableKey(axes: FilterAxis[], key: string): boolean {
  if (!key) return false;
  const memo = new Map<string, number>();
  const count = (index: number, offset: number): number => {
    if (index === axes.length) return offset === key.length ? 1 : 0;
    const state = `${index}:${offset}`;
    const cached = memo.get(state);
    if (cached !== undefined) return cached;
    const axis = axes[index];
    let ways = count(index + 1, offset);
    for (const option of axis.options) {
      const token = `${axis.key}${option.value}`;
      if (key.startsWith(token, offset)) ways += count(index + 1, offset + token.length);
      if (ways > 1) break;
    }
    memo.set(state, Math.min(ways, 2));
    return Math.min(ways, 2);
  };
  return count(0, 0) === 1;
}

export function selectedFilterTable(profile: Profile, axes: FilterAxis[], selection: FilterSelection,
  decoded?: DecodedFilterAggregation): EvFilterTable | AggregateFilterTable | undefined {
  const key = filterSelectionKey(axes, selection);
  if (!key) return undefined;
  const aggregation = profile.evFilters?.aggregation;
  if (!aggregation) return profile.evFilters?.tables[key];
  const prepared = decoded ?? (aggregation.rows !== undefined ? aggregation : undefined);
  return prepared ? aggregateFilterTable(prepared, axes, selection, profile.gRange.start) : undefined;
}

/** 明示された空配列も新形式。旧軸を復活させない。 */
export function declaredFilterAxes(profile: Profile): FilterAxis[] | undefined {
  const axes = profile.evFilters?.axes;
  if (axes === undefined) return undefined;
  return axes.map(axis => ({ ...axis, label: rewriteAxisLabel(axis.label),
    allLabel: profile.aimKind || profile.evFilters?.selectionPolicy ? "不問" : axis.allLabel }));
}

/** 狙い方・レート切替後も適用できる絞り込みだけを引き継ぐ。 */
export function compatibleFilterSelection(
  profile: Profile,
  selection: Record<string, string | null>
): Record<string, string | null> {
  const filters = profile.evFilters;
  const axes = filters?.axes;
  // 軸の対応を確認できない旧形式は、切替先の既定表から始める。
  if (!filters || !axes?.length) return {};

  const next: Record<string, string | null> = {};
  for (const axis of axes) {
    const value = selection[axis.key];
    if (value != null && axis.options.some((option) => option.value === value)) {
      next[axis.key] = value;
    }
  }
  // 組合せの表がまだ無くても選択を保持。単独では差がなく、掛け合わせでだけ
  // 採用された条件へ進めるようにし、表示側は完全一致が無ければ空表にする。
  return next;
}
