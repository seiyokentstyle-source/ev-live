import { describe, expect, it } from "vitest";
import { groupProfiles, rewriteCeiling } from "../lib/ev/profiles";
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
    // 設定1想定のタブは低設定想定店舗混合にしか出ない＝店舗名で分かるので名乗らない
    ["ボーナス間（950pt仕様・横軸は実G実測）（設定1想定・回数不問）",
     "ボーナス間（950pt）（回数不問）"],
    ["AT・RB間天井（設定1想定）", "BB・RB間天井期待値"],
    ["AT間天井（設定1想定）", "AT間天井期待値"],
    ["CZ間（リセット時 液晶カウンタ500（実G目安約370〜400G））（CZ1回でやめ・朝一リセット想定）",
     "CZ間（リセ500）（CZ1回・リセ）"],
    ["ボーナス間天井（前回種別で999/499G）（前回BIG/ST後・通常）",
     "ボーナス間天井（999/499G）（前回BIG/ST後）"],
    // 何G打つかは2行目に出るので、名前は「引き戻し狙い」だけにする
    ["引き戻しゾーン（AT後16Gだけ打つ）", "引き戻し狙い"],
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

describe("天井表記の言い換え", () => {
  it("引き戻しゾーンの説明は落とし、G数だけ短く出す", () => {
    expect(rewriteCeiling("AT終了から16G／当選したらその連チャンを消化してやめ"))
      .toBe("AT後16G");
  });

  it("リセット仕様は落とす（算出条件の「リセット仕様」と同じ文字列の重複）", () => {
    expect(rewriteCeiling("リセット仕様：ボーナス間が600〜699pt+α。固定実Gへは換算しない")).toBe("");
    expect(rewriteCeiling("リセット仕様：510G（15.2%）/1000G（20.3%）/1480G（64.5%）の再抽選")).toBe("");
  });

  it("天井の数字は落とさない", () => {
    expect(rewriteCeiling("リセット天井 650G／ボーナス間最大650G+α、炎炎ループ間1500G+α"))
      .toContain("650G");
    expect(rewriteCeiling("AT間2000G（非公開情報）／AT当選でやめ／通常（下位AT後）"))
      .toContain("2000G");
  });

  it("空や未定義でも落ちない", () => {
    expect(rewriteCeiling("")).toBe("");
    expect(rewriteCeiling(undefined as unknown as string)).toBe("");
  });
});

describe("ヴヴヴ2の表示（指定どおりの6行）", () => {
  function tab(key: string, label: string, ceiling: string) {
    return { ...profile(`${key}_4652`, `${label}・46/52`), ceiling };
  }

  it("名前と2行目が指定どおりになる", () => {
    const groups = groupProfiles([
      tab("game_ceiling", "AT・RB間天井（通常）", "1500G／BB・RB当選でやめ"),
      tab("bb_ceiling", "BB間天井（BBまでツッパ・通常）", "1500G／他種別は流してBBまで"),
      tab("cz_ceiling", "CZ間天井（CZ1回でやめ・通常）", "CZ間 999G"),
      tab("reset", "朝一（リセット想定・実測）", "リセット天井 1000G／AT/RB間1000G/ラッシュ間最大3周期"),
      tab("pullback", "引き戻しゾーン（AT後71Gだけ打つ）", "AT終了から71G"),
      tab("cz_reset", "CZ間天井（CZ1回でやめ・朝一リセット想定）", "CZ間 999G")
    ], "vvv2").groups;
    expect(groups.map((g) => [g.label, g.ceiling])).toEqual([
      ["BB・RB間天井", "1500G／BB・RB当選でやめ"],
      ["BB間天井期待値", "1500G／BBまでツッパ"],
      ["CZ間天井（CZ1回）", "CZ間 999G"],
      ["朝一（リセット）", "リセット天井 1000G"],
      ["引き戻し狙い", "AT後71G"],
      ["CZ間天井（CZ1回・リセ）", "リセット天井 3周期"]
    ]);
  });

  it("機種別の上書きは他機種に漏れない", () => {
    // cz_reset の「リセット天井 3周期」はヴヴヴ2のリセット仕様。別機種には当てない。
    const other = groupProfiles([tab("cz_reset", "CZ間天井（CZ1回でやめ・朝一リセット想定）", "CZ間 500G")], "hokuto").groups;
    expect(other[0].ceiling).toBe("CZ間 500G");
  });

  it("リセット天井は数字だけ残る（内訳は算出条件に出る）", () => {
    expect(rewriteCeiling("リセット天井 650G／ボーナス間最大650G+α、炎炎ループ間1500G+α"))
      .toBe("リセット天井 650G");
  });
});

// 低設定想定店舗混合のヴヴヴ2。「全体平均」で別枠に出していた表は、打ち方としては
// 主表（BB・RB間天井）そのものなので、再生成後は打ち方別のタブに並ぶ。
describe("低設定想定店舗混合のタブ（設定1想定）", () => {
  function tab(key: string, label: string, ceiling: string) {
    return { ...profile(`${key}_4652`, `${label}・46/52`), ceiling };
  }

  it("2タブとも店舗名で分かることは名乗らない", () => {
    const groups = groupProfiles([
      tab("game_ceiling_s1", "AT・RB間天井（設定1想定）",
        "1500G／BB・RB当選でやめ／獲得を86.5%に補正"),
      tab("cz_s1", "CZ間天井（設定1想定・CZ1回でやめ）", "CZ間 999G／獲得を86.5%に補正")
    ], "vvv2").groups;
    expect(groups.map((g) => g.label)).toEqual([
      "BB・RB間天井期待値",
      "CZ間天井（CZ1回）"
    ]);
  });

  it("補正率は2行目に残す（何%落とした表かは数字なので落とさない）", () => {
    expect(rewriteCeiling("1500G／BB・RB当選でやめ／獲得を86.5%に補正"))
      .toContain("86.5%");
  });
});

describe("再生成後（生成側が リセットCZ間天井 を出す）でも表示が変わらない", () => {
  function tab(key: string, label: string, ceiling: string) {
    return { ...profile(`${key}_4652`, `${label}・46/52`), ceiling };
  }

  it("cz_reset は再生成の前後どちらの表記でも同じ6行目になる", () => {
    const before = groupProfiles([
      tab("cz_reset", "CZ間天井（CZ1回でやめ・朝一リセット想定）", "CZ間 999G")
    ], "vvv2").groups[0];
    const after = groupProfiles([
      tab("cz_reset", "CZ間（リセット時 3周期）（CZ1回でやめ・朝一リセット想定）", "CZ間 3周期")
    ], "vvv2").groups[0];
    expect([before.label, before.ceiling]).toEqual(["CZ間天井（CZ1回・リセ）", "リセット天井 3周期"]);
    expect([after.label, after.ceiling]).toEqual(["CZ間天井（CZ1回・リセ）", "リセット天井 3周期"]);
  });
});
