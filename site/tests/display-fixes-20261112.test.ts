import { describe, expect, it } from "vitest";
import { rewriteManufacturer } from "../lib/ev/profiles";

describe("manufacturers for machines the data calls 未確認", () => {
  it.each([
    ["L HEY!ｴﾘｰﾄｻﾗﾘｰﾏﾝ鏡", "大都技研"], ["L ＨＥＹ！エリートサラリーマン鏡", "大都技研"],
    ["L 無職転生 ～異世界行ったら本気だす～", "ニューギン"],
    ["L Ｔｏ　ＬＯＶＥるダークネス", "オリンピアエステート"],
    ["Lパチスロ　ガールズ＆パンツァー最終章", "平和"],
    ["L少女☆歌劇 レヴュースタァライト -The SLOT-", "オーイズミ"],
    ["パチスロ　アイドルマスター　ミリオンライブ！", "ビスティ"],
    ["バーサスリヴァイズ", "エレコ"], ["ﾊﾞｰｻｽﾘｳﾞｧｲｽﾞ", "エレコ"],
    ["Lいざ!番長", "大都技研"], ["L七つの魔剣が支配する", "コナミアミューズメント"],
    ["L沖ﾄﾞｷ!DUO ｱﾝｺｰﾙ", "メーシー"], ["沖ﾄﾞｷ!GOLD-30", "ミズホ"],
    ["沖ﾄﾞｷ!ｺﾞｰｼﾞｬｽ-30", "エレコ"], ["沖ﾄﾞｷ!ｺﾞｰｼﾞｬｽ", "ミズホ"],
    ["L鉄拳6", "山佐ネクスト"], ["L麻雀格闘倶楽部 覚醒", "コナミアミューズメント"],
    ["Lｱﾆﾏﾙｽﾛｯﾄﾄﾞｯﾁ", "北電子"], ["Lｺﾞｼﾞﾗ対ｴｳﾞｧﾝｹﾞﾘｵﾝ", "ビスティ"], ["Lﾀﾞｰｸﾊｲﾋﾞ", "パイオニア"],
    ["Lﾋﾞｯｸﾞﾄﾞﾘｰﾑ", "Sammy"], ["Lﾛｰﾃｨｽ", "北電子"],
    ["交響詩篇ｴｳﾚｶｾﾌﾞﾝTYPE-ART", "Sammy"], ["甲鉄城のｶﾊﾞﾈﾘ", "Sammy"],
    ["Lバンドリ！", "オリンピアエステート"], ["戦国コレクション５", "コナミアミューズメント"],
    ["Lとある魔術の禁書目録", "藤商事"],
  ])("%s → %s", (name, maker) => {
    expect(rewriteManufacturer(name, "未確認")).toBe(maker);
    expect(rewriteManufacturer(name, "未登録")).toBe(maker);
    expect(rewriteManufacturer(name, "データの値")).toBe("データの値");
  });
  it("leaves an unknown machine as the data says", () => {
    expect(rewriteManufacturer("知らない機種", "未確認")).toBe("未確認");
  });
});
