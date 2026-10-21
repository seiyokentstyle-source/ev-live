import { describe, expect, test } from "vitest";
import type { Profile } from "../lib/ev/types";
import { groupProfiles, visibleCalcSpecItems } from "../lib/ev/profiles";

// Synthetic fixtures so the test does not depend on nightly-scraped numbers.
function makeProfile(key: string, label: string): Profile {
  return {
    key,
    label,
    ceiling: "1000G",
    gRange: { start: 0, end: 1000, step: 100 },
    activeAxes: ["rate"],
    baseAnchors: [{ g: 0, ev: 0, rtp: 100 }],
    zones: []
  };
}

describe("groupProfiles label cleanup", () => {
  // Old data bakes a sample-count suffix「（n=◯◯）」into the label; sample size
  // now lives in the EvTable「サンプル数」column, so the tab label must drop it.
  test("strips（n=◯◯）from rate-suffixed labels", () => {
    const { groups } = groupProfiles([
      makeProfile("after_first_4652", "通常・46/52（n=154）"),
      makeProfile("after_first_5050", "通常・50/50（n=154）")
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("通常");
  });

  // 「AT・RB間天井」は区切りがBBとRBなので「BB・RB間天井」に言い換える（LABEL_REWRITES）。
  // ここで見たいのは（n=◯◯）が落ちることなので、言い換え後の表記で確かめる。
  test("strips（n=◯◯）from unsuffixed labels", () => {
    const { groups } = groupProfiles([makeProfile("game_ceiling", "AT・RB間天井（n=743）")]);
    expect(groups[0].label).toBe("BB・RB間天井");
    expect(groups[0].label).not.toContain("n=");
  });

  test("leaves labels without the suffix unchanged", () => {
    const { groups } = groupProfiles([makeProfile("reset_4652", "リセット狙い・46/52")]);
    expect(groups[0].label).toBe("リセット狙い");
  });

  // 文言の言い換え（LABEL_REWRITES）はデータ再生成を待たずサイト側で即時反映する。
  // 旧データの「据え置き」は新表記「通常」に寄せたうえで、「通常」は既定の狙い方
  // なので見出しからは落とす（他と並んだときだけ意味を持つ語）。
  // n= の除去と併用しても効く。
  test("rewrites 据え置き to 通常 without regenerating data", () => {
    const { groups } = groupProfiles([
      makeProfile("game_ceiling_4652", "AT・RB間天井（据え置き）・46/52（n=822）"),
      makeProfile("game_ceiling_5050", "AT・RB間天井（据え置き）・50/50（n=822）")
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("BB・RB間天井");
    expect(groups[0].label).not.toContain("据え置き");
  });
});

// 算出条件のうち画面に出さない項目。文言の言い換えと同じくサイト側で即時に落とす。
describe("visibleCalcSpecItems", () => {
  // Synthetic fixtures so the test does not depend on nightly-scraped values.
  const items = [
    { k: "賭け枚数", v: "3枚掛け" },
    { k: "仕様出典", v: "https://example.invalid/a / https://example.invalid/b" },
    { k: "アンカー間隔", v: "10G刻み" }
  ];

  test("drops 仕様出典 from the conditions bar", () => {
    const got = visibleCalcSpecItems(items);
    expect(got.map((i) => i.k)).toEqual(["賭け枚数", "アンカー間隔"]);
  });

  test("keeps every other item in the original order", () => {
    // 並びは生成側が決める。落とす以外のことをしない。
    const got = visibleCalcSpecItems(items);
    expect(got).toEqual([items[0], items[2]]);
  });

  test("does not mutate the input", () => {
    const before = items.length;
    visibleCalcSpecItems(items);
    expect(items).toHaveLength(before);
  });

  test("is a no-op once the generator stops emitting it", () => {
    // 生成側から消えても壊れない（データが正・ここは表示の都合、という関係）。
    const withoutSource = [{ k: "賭け枚数", v: "3枚掛け" }];
    expect(visibleCalcSpecItems(withoutSource)).toEqual(withoutSource);
  });

  test("handles an empty list", () => {
    expect(visibleCalcSpecItems([])).toEqual([]);
  });
});

describe("shaman king aims", () => {
  test("shows release, bonus interval and reset bonus interval in that order", () => {
    const { groups } = groupProfiles([
      makeProfile("cz_ceiling_4652", "ボーナス間天井（回数不問・通常）・46/52"),
      makeProfile("cz_reset_4652", "ボーナス間（リセット時 500G+α）（回数不問・朝一リセット想定）・46/52"),
      makeProfile("point_release_4652", "巫門遁甲ポイント解放まで（スルー到達型）・46/52")
    ], "m695e7825");
    expect(groups.map(group => group.label)).toEqual(["巫門遁甲解放まで", "ボナ間", "リセボナ間"]);
  });
});

describe("aim tab ceiling hint", () => {
  test("keeps only the ceiling games", async () => {
    const { ceilingHint } = await import("../lib/ev/profiles");
    expect(ceilingHint("999G／AT当選でやめ／獲得を97.3%に補正")).toBe("999G");
    expect(ceilingHint("ボーナス間 800G+α")).toBe("800G+α");
    expect(ceilingHint("リセット天井 799G／設定変更時はAT間799G+α")).toBe("799G");
    expect(ceilingHint("CZ間 最長963G（実測・固定G天井なし）")).toBe("天井なし");
    expect(ceilingHint("天国間（天井なし・実測）／天国に入るまで打つ")).toBe("天井なし");
    expect(ceilingHint("CZ間 液晶最大1200G（実G目安約890G）")).toBe("1200G");
    expect(ceilingHint("ボーナス間 950pt+α")).toBe("950pt+α");
    expect(ceilingHint("解放AT終了まで／通常AT・ボーナス経由AT当選後も続行")).toBe("");
    expect(ceilingHint("AT当選でやめ")).toBe("");
  });
});

describe("short aim label", () => {
  test("keeps only what separates the strategies", async () => {
    const { shortAimLabel } = await import("../lib/ev/profiles");
    const cases: Array<[string, string]> = [
      ["朝一（リセット想定・実測）", "リセット"],
      ["朝一（実測）", "朝一"],
      ["AT間天井（通常）", "AT間"],
      ["AT間天井（設定1想定）", "AT間（設定1）"],
      ["CZ間天井（回数不問・通常）", "CZ間"],
      ["CZ間天井（設定1想定・回数不問）", "CZ間（設定1）"],
      ["CZ間天井（回数不問・朝一リセット想定）", "リセCZ間"],
      ["ボーナス間（リセット時 500G+α）（回数不問・朝一リセット想定）", "リセボナ間"],
      ["ボーナス間（固定G天井なし・実測）（回数不問・通常）", "ボナ間"],
      ["AT間天井（通常（下位AT後））", "AT間（下位AT後）"],
      ["AT間天井（上位AT後）", "AT間（上位AT後）"],
      ["ボーナス間天井（前回BB後・通常）", "ボナ間（前回BB後）"],
      ["AT間・駆け抜け後（短縮天井596G）", "AT間・駆け抜け後"],
      ["天国間（通常・実測）", "天国間"],
      ["巫門遁甲解放まで", "巫門遁甲解放まで"],
      ["AT間天井（上位AT後・128Gまで見てやめ）", "AT間（上位AT後・128Gやめ）"],
      ["AT・RB間天井（通常）", "BB・RB間"],
      ["CZ間天井（回数不問・リセ）", "リセCZ間"],
    ];
    for (const [input, expected] of cases) expect(shortAimLabel(input)).toBe(expected);
  });
});
