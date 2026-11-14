import { describe, expect, it } from "vitest";
import { resetAimLabel, resetCeilingHint, shortAimLabel } from "../lib/ev/profiles";

// 利用者指摘 2026-11-13：リセットの表に天井Gが無い・何までの天井か分からない・ヴァルヴレイヴのミミズの表が見分けられない。
describe("リセットの狙い方の見出し", () => {
  it("主表の区切りを付ける", () => {
    expect(resetAimLabel("リセット", "AT間")).toBe("リセAT間");
    expect(resetAimLabel("リセット", "ボナ間")).toBe("リセボナ間");
    expect(resetAimLabel("朝一", "ボーナス/AT間")).toBe("朝一ボーナス/AT間");
    expect(resetAimLabel("リセット", "")).toBe("リセット");
    expect(resetAimLabel("リセット（設定1）", "AT間")).toBe("リセット（設定1）");
  });

  it("天井のG数を元の天井表記から読む", () => {
    expect(resetCeilingHint("リセット天井 600G／設定変更後・上位ST後は600G+α", "999G")).toBe("600G");
    expect(resetCeilingHint("朝一実測（999G）", "999G")).toBe("999G");
    expect(resetCeilingHint("リセット仕様：設定変更時はCZまで777G+α", "1200G")).toBe("CZまで777G+α");
    expect(resetCeilingHint("リセット仕様：設定変更後はボーナス間300G+α、SJは2スルー", "975G+α")).toBe("ボーナス間300G+α");
    expect(resetCeilingHint("リセット仕様：450G（70%）/650G（30%）の振分。単一値に丸めない", "800G")).toBe("450/650G");
    expect(resetCeilingHint("リセット仕様：510G（15.2%）/1000G（20.3%）/1480G（64.5%）の再抽選", "1480G")).toBe("510/1000/1480G");
    expect(resetCeilingHint("リセット仕様：設定1では65.2%で500G+α、34.8%で1111G+α。500Gは保証上限ではない", "1111G")).toBe("500/1111G");
    expect(resetCeilingHint("リセット仕様：最大1280あべし＋内部あべし加算", "1280あべし")).toBe("1280あべし");
    expect(resetCeilingHint("リセット仕様：固定の最大値短縮は確認できず、内部G加算・モード再抽選", "1500G")).toBe("1500G・短縮なし");
    expect(resetCeilingHint("リセット仕様：AT間の固定短縮なし（モード優遇）", "")).toBe("短縮なし");
    expect(resetCeilingHint("リセット仕様：CZ間G数は設定変更でも引き継ぐ", "999G")).toBe("999G・短縮なし");
    expect(resetCeilingHint("朝一実測（ボーナス間G数天井なし（CZは履歴信号に出ない））", "")).toBe("天井なし");
    expect(resetCeilingHint("AT当選でやめ／獲得はカウンター履歴からの推定", "")).toBe("");
  });

  it("ヴァルヴレイヴのミミズモードの表を見分ける", () => {
    expect(shortAimLabel("ボーナス/AT間天井（ミミズモード（推定））")).toBe("ボーナス/AT間（ミミズ）");
    expect(shortAimLabel("CZ間（液晶1000G・実G実測）（回数不問・ミミズモード（推定））")).toBe("CZ間（ミミズ）");
    expect(shortAimLabel("ボーナス/AT間天井（通常（下位AT後））")).toBe("ボーナス/AT間（下位AT後）");
  });
});

describe("ヴヴヴ2の朝一の見出し（2026-11-15）", () => {
  it("区切りの「・」で切らない・周期の表もそろえる", async () => {
    const { aimIntervalBase } = await import("../lib/ev/profiles");
    const group = { key: "game_ceiling", label: "AT・RB間天井", ceiling: "", variants: {}, order: [{ key: "game_ceiling_4652", label: "AT・RB間天井（通常）・46/52" }] } as never;
    expect(aimIntervalBase(group)).toBe("BB・RB間");
    expect(resetAimLabel("リセット", "BB・RB間")).toBe("リセBB・RB間");
    expect(resetAimLabel("リセット（周期）", "BB・RB間")).toBe("リセBB・RB間（周期）");
  });
});
