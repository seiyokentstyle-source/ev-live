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

  test("strips（n=◯◯）from unsuffixed labels", () => {
    const { groups } = groupProfiles([makeProfile("game_ceiling", "AT・RB間天井（n=743）")]);
    expect(groups[0].label).toBe("AT・RB間天井");
  });

  test("leaves labels without the suffix unchanged", () => {
    const { groups } = groupProfiles([makeProfile("reset_4652", "リセット狙い・46/52")]);
    expect(groups[0].label).toBe("リセット狙い");
  });

  // 文言の言い換え（LABEL_REWRITES）はデータ再生成を待たずサイト側で即時反映する。
  // 旧データの「据え置き」は新表記「通常」で表示される（n=除去と併用でも効く）。
  test("rewrites 据え置き to 通常 without regenerating data", () => {
    const { groups } = groupProfiles([
      makeProfile("game_ceiling_4652", "AT・RB間天井（据え置き）・46/52（n=822）"),
      makeProfile("game_ceiling_5050", "AT・RB間天井（据え置き）・50/50（n=822）")
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("AT・RB間天井（通常）");
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
