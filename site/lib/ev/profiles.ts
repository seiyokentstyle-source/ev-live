import type { Profile } from "./types";

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
const LABEL_REWRITES: Array<[RegExp, string]> = [
  [/据え置き/g, "通常"]
];
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
  ["コードギアス", "サミー"],
  ["ストリートファイター", "レオスター"],
  ["ひぐらし", "オーイズミ"],
  ["ハイパーラッシュ", "セブンリーグ"],
  ["かるてっと", "サミー"],
  ["邪神ちゃん", "三洋物産"],
  ["転生の章", "サミー"],
  ["禁書目録", "藤商事"],
  ["かぐや様", "SANKYO"],
  ["タクトオーパス", "平和"],
  ["チバリヨ", "ネット"],
  ["デビルメイクライ", "アデリオン"],
  ["南国育ち", "平和"],
  ["超電磁砲", "藤商事"],
  ["シャーマンキング", "エレコ"],
  ["モンスターハンター", "エンターライズ"],
  ["化物語", "サミー"],
  ["グランベルム", "北電子"],
  ["戦国コレクション", "コナミアミューズメント"],
  ["吉宗", "大都技研"]
];

/** メーカー名。データが「未登録」のときだけ、機種名から引いて補う。 */
export function rewriteManufacturer(name: string, manufacturer: string): string {
  if (manufacturer !== "未登録") return manufacturer;
  const hit = MANUFACTURER_REWRITES.find(([key]) => name.includes(key));
  return hit ? hit[1] : manufacturer;
}

/** 軸の見出しを現在の表記に直して返す。中身（key/options）はデータのまま. */
export function rewriteAxisLabel(label: string): string {
  let out = label;
  for (const [from, to] of AXIS_LABEL_REWRITES) out = out.replace(from, to);
  return out;
}

const SINGLE = "_single";

function parseProfile(profile: Profile): { baseKey: string; baseLabel: string; rate: string | null } {
  let cleanLabel = profile.label.replace(SAMPLE_SUFFIX_RE, "");
  for (const [from, to] of LABEL_REWRITES) cleanLabel = cleanLabel.replace(from, to);
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

export function groupProfiles(profiles: Profile[]): GroupedProfiles {
  const order: string[] = [];
  const map = new Map<string, ProfileGroup>();
  const rateSet = new Set<string>();

  for (const profile of profiles) {
    const { baseKey, baseLabel, rate } = parseProfile(profile);
    if (rate) rateSet.add(rate);

    let group = map.get(baseKey);
    if (!group) {
      group = { key: baseKey, label: baseLabel, ceiling: profile.ceiling, variants: {}, order: [] };
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

  return { groups: order.map((key) => map.get(key) as ProfileGroup), rates, defaultRate };
}

export function resolveProfile(group: ProfileGroup, rate: string | null): Profile {
  if (rate && group.variants[rate]) return group.variants[rate];
  if (group.variants[SINGLE]) return group.variants[SINGLE];
  return group.order[0];
}
