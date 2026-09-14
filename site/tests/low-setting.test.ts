import { describe, expect, it } from "vitest";
import { onlyLowSetting, withoutLowSetting } from "../lib/ev/low-setting";
import type { Machine, Profile } from "../lib/ev/types";

function profile(label: string, key = label): Profile {
  return {
    key,
    label,
    ceiling: "",
    gRange: { start: 0, end: 100, step: 10 },
    activeAxes: [],
    baseAnchors: [],
    zones: []
  };
}

function machine(profiles: Profile[], extra: Partial<Machine> = {}): Machine {
  return {
    id: "vvv2",
    name: "スマスロ 革命機ヴァルヴレイヴ2",
    manufacturer: "SANKYO",
    aliases: [],
    thumb: null,
    available: true,
    releaseDate: "2025-01-01",
    lastUpdated: "2026-09-13",
    meta: { samples: "", source: "" },
    profiles,
    axes: [],
    modifiers: {},
    creditValue: {},
    economics: { medalsPerGame: 1.5, gamesPerHour: 800 },
    ...extra
  } as Machine;
}

const REAL = profile("AT・RB間天井（通常）・46/52");
const EST = profile("CZ間天井（設定1想定・CZ1回でやめ）・46/52");
const THEORY = { label: "設定1想定", baseAnchors: [] } as Machine["theoretical"];

describe("店舗別の表示（withoutLowSetting）", () => {
  it("設定1想定の表と理論表を外す", () => {
    const out = withoutLowSetting(machine([REAL, EST], { theoretical: THEORY }));
    expect(out.profiles.map((p) => p.label)).toEqual([REAL.label]);
    expect(out.theoretical).toBeUndefined();
  });

  it("推定が無い機種はそのまま返す", () => {
    const input = machine([REAL]);
    expect(withoutLowSetting(input)).toBe(input);
  });

  it("全部が推定なら profile は外さない（空にすると機種ページが消える）", () => {
    const out = withoutLowSetting(machine([EST], { theoretical: THEORY }));
    expect(out.profiles.map((p) => p.label)).toEqual([EST.label]);
    expect(out.theoretical).toBeUndefined();
  });

  it("元のオブジェクトを書き換えない", () => {
    const input = machine([REAL, EST], { theoretical: THEORY });
    withoutLowSetting(input);
    expect(input.profiles).toHaveLength(2);
    expect(input.theoretical).toBeDefined();
  });
});

describe("低設定想定店舗混合の表示（onlyLowSetting）", () => {
  it("設定1想定の表だけを残す", () => {
    const out = onlyLowSetting(machine([REAL, EST], { theoretical: THEORY }));
    expect(out?.profiles.map((p) => p.label)).toEqual([EST.label]);
    expect(out?.theoretical).toBeDefined();
  });

  it("実測でしか出せないものは持って行かない", () => {
    const out = onlyLowSetting(
      machine([REAL, EST], {
        settingAim: { units: [], dates: [] } as unknown as Machine["settingAim"],
        atPayout: {} as Machine["atPayout"],
        harakiri: {} as Machine["harakiri"],
        savedTargets: [] as Machine["savedTargets"]
      })
    );
    expect(out?.settingAim).toBeUndefined();
    expect(out?.atPayout).toBeUndefined();
    expect(out?.harakiri).toBeUndefined();
    expect(out?.savedTargets).toBeUndefined();
  });

  it("設定1想定が無い機種は一覧に出さない", () => {
    expect(onlyLowSetting(machine([REAL]))).toBeNull();
  });

  it("理論表しか無い機種も出さない（profiles が空だと描画できない）", () => {
    expect(onlyLowSetting(machine([REAL], { theoretical: THEORY }))).toBeNull();
  });
});

// 生成側（777site-scraper）が主表の双子 game_ceiling_s1_* を出すようになった後の形。
// 「全体平均」で別枠に出していた表が、同じ打ち方のタブとして混合側に並ぶ。
describe("主表の設定1想定（game_ceiling_s1）", () => {
  const MAIN_S1 = profile("AT・RB間天井（設定1想定）・46/52", "game_ceiling_s1_4652");

  it("混合側へ移り、店舗別には残らない", () => {
    const input = machine([REAL, MAIN_S1, EST]);
    expect(withoutLowSetting(input)?.profiles.map((p) => p.key)).toEqual([REAL.key]);
    expect(onlyLowSetting(input)?.profiles.map((p) => p.key)).toEqual([MAIN_S1.key, EST.key]);
  });

  // ★タブ名からは「設定1想定」を落とす（profiles.ts の LABEL_REWRITES）。
  //   振り分けは生のラベルで見るので、表示を短くしても移設は壊れない。
  it("振り分けは生のラベルで見る（タブ名の言い換えに影響されない）", () => {
    const out = onlyLowSetting(machine([REAL, MAIN_S1]));
    expect(out?.profiles[0].label).toBe("AT・RB間天井（設定1想定）・46/52");
  });

  // 再生成後は theoretical が消える（同じ表が2か所に出ないように生成側で止めた）。
  it("theoretical が無くても混合は成立する", () => {
    const out = onlyLowSetting(machine([REAL, MAIN_S1]));
    expect(out?.theoretical).toBeUndefined();
    expect(out?.profiles).toHaveLength(1);
  });
});

describe("算出条件の振り分け", () => {
  const calcSpec = {
    items: [
      { k: "通常時使用枚数", v: "1.5" },
      { k: "設定1想定の補正", v: "メーカー公表の機械割は枚ベース…" }
    ]
  };

  it("店舗別からは補正の説明を外す（出していない表の説明は読めない）", () => {
    const out = withoutLowSetting(machine([REAL, EST], { calcSpec }));
    expect(out.calcSpec?.items.map((i) => i.k)).toEqual(["通常時使用枚数"]);
  });

  it("混合は補正の説明だけ持つ", () => {
    const out = onlyLowSetting(machine([REAL, EST], { calcSpec }));
    expect(out?.calcSpec?.items.map((i) => i.k)).toEqual(["設定1想定の補正"]);
  });

  it("補正の説明が無ければ算出条件はそのまま", () => {
    const plain = { items: [{ k: "通常時使用枚数", v: "1.5" }] };
    const out = withoutLowSetting(machine([REAL, EST], { calcSpec: plain }));
    expect(out.calcSpec).toBe(plain);
  });
});

describe("獲得が実測でない機種（カウンターに獲得が出ない）", () => {
  const noPayout = {
    items: [
      { k: "AT純増", v: "3.6枚/G" },
      { k: "★獲得は実測ではない", v: "1回あたりの獲得を公表の設定1機械割から逆算した定数で置いている" }
    ]
  };

  it("実測の棚には出さない（期待値が獲得側で決まるので表全体が理論値）", () => {
    expect(withoutLowSetting(machine([REAL], { calcSpec: noPayout }))).toBeNull();
  });

  it("混合にはそのまま全部出す", () => {
    const input = machine([REAL], { calcSpec: noPayout });
    const out = onlyLowSetting(input);
    expect(out).toBe(input);
    expect(out?.profiles.map((p) => p.label)).toEqual([REAL.label]);
  });

  it("印が無ければ従来どおり（実測の棚に残る）", () => {
    const input = machine([REAL], { calcSpec: { items: [{ k: "AT純増", v: "3.6枚/G" }] } });
    expect(withoutLowSetting(input)).toBe(input);
    expect(onlyLowSetting(input)).toBeNull();
  });
});
