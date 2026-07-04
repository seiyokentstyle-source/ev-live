import { describe, expect, test } from "vitest";
import type { Profile } from "../lib/ev/types";
import { groupProfiles } from "../lib/ev/profiles";

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
