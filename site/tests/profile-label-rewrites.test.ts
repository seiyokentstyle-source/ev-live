import { describe, expect, it } from "vitest";
import { groupProfiles } from "../lib/ev/profiles";
import type { Profile } from "../lib/ev/types";

/**
 * タブ名の言い換え。見出しは「どの狙い方か」が分かれば足りるので、測り方の断り
 * （実測/実G実測）や「固定G天井なし」は落とす。数字は狙い方の識別に要るので残す。
 * ★短くしすぎて2つのタブが同じ名前になると見分けがつかない。そこを固定する。
 */
function profile(key: string, label: string): Profile {
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

function labelOf(raw: string): string {
  return groupProfiles([profile("k_4652", `${raw}・46/52`)]).groups[0].label;
}

describe("タブ名の言い換え", () => {
  it.each([
    ["AT間天井（通常）", "AT間天井"],
    ["CZ間天井（CZ1回でやめ・通常）", "CZ間天井（CZ1回）"],
    ["朝一（リセット想定・実測）", "朝一（リセット）"],
    ["朝一（実測）", "朝一"],
    ["ボーナス間（固定G天井なし・実測）（ボーナス1回でやめ・朝一リセット想定）",
     "ボーナス間（ボーナス1回・リセ）"],
    ["CZ間（液晶1000G・実G実測）（CZ1回でやめ・通常）", "CZ間（液晶1000G）（CZ1回）"],
    ["ボーナス間（950pt仕様・横軸は実G実測）（設定1想定・回数不問）",
     "ボーナス間（950pt）（設定1想定・回数不問）"],
    ["CZ間（リセット時 液晶カウンタ500（実G目安約370〜400G））（CZ1回でやめ・朝一リセット想定）",
     "CZ間（リセ500）（CZ1回・リセ）"],
    ["ボーナス間天井（前回種別で999/499G）（前回BIG/ST後・通常）",
     "ボーナス間天井（999/499G）（前回BIG/ST後）"],
    ["引き戻しゾーン（AT後16Gだけ打つ）", "引き戻しゾーン（AT後16G）"],
    ["AT間（1536あべし・実G実測）（通常（下位AT後））", "AT間（1536あべし）（通常（下位AT後））"]
  ])("%s → %s", (raw, expected) => {
    expect(labelOf(raw)).toBe(expected);
  });

  it("数字は落とさない（狙い方の識別に要る）", () => {
    expect(labelOf("CZ間（900pt・実G実測）（CZ1回でやめ・通常）")).toContain("900pt");
    expect(labelOf("CZ間天井（499G+α・実測）（通常）")).toContain("499G+α");
  });

  it("実測・実G実測は残さない", () => {
    for (const raw of [
      "ボーナス間（固定G天井なし・実測）（通常）",
      "CZ間（液晶1200G・実G実測）（CZ1回でやめ・通常）",
      "AT間（実G実測）（通常）"
    ]) {
      expect(labelOf(raw)).not.toContain("実測");
    }
  });

  it("同じ機種の中でタブ名が衝突しない", () => {
    const groups = groupProfiles([
      profile("a_4652", "CZ間天井（CZ1回でやめ・通常）・46/52"),
      profile("b_4652", "CZ間天井（CZ1回でやめ・朝一リセット想定）・46/52"),
      profile("c_4652", "AT間天井（通常）・46/52"),
      profile("d_4652", "AT間天井（通常（下位AT後））・46/52")
    ]).groups;
    const labels = groups.map((g) => g.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("空の括弧を残さない", () => {
    expect(labelOf("ボーナス間（固定G天井なし・実測）（通常）")).toBe("ボーナス間");
  });
});
