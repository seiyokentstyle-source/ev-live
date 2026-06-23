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
const SINGLE = "_single";

function parseProfile(profile: Profile): { baseKey: string; baseLabel: string; rate: string | null } {
  const cleanLabel = profile.label.replace(SAMPLE_SUFFIX_RE, "");
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
