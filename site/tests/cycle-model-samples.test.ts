import { describe, expect, it } from "vitest";
import { realSampleCounts } from "@/components/ev/EvTable";

// 周期モデルの表（東京リベンジャーズ）：サンプル欄は試算の回数ではなく実件数と推定件数（利用者指定 2026-11-14）。
describe("realSampleCounts", () => {
  const anchors = [
    { g: 0, ev: -100, rtp: 99, n: 60000, realN: 684 },
    { g: 100, ev: -50, rtp: 99.5, n: 47341, realN: 520 }
  ];

  it("絞り込み不問では推定件数＝実件数", () => {
    expect(realSampleCounts({ g: 100, n: 47341 }, anchors)).toEqual({ real: 520, estimate: 520 });
  });

  it("絞り込みでは実件数×（条件の試算回数÷不問の試算回数）", () => {
    expect(realSampleCounts({ g: 0, n: 6000 }, anchors)).toEqual({ real: 684, estimate: 68 });
  });

  it("実件数の無いG・旧データは空欄", () => {
    expect(realSampleCounts({ g: 50, n: 100 }, anchors)).toEqual({ real: undefined, estimate: undefined });
    expect(realSampleCounts({ g: 0, n: 100 }, [{ g: 0, ev: 0, rtp: 100, n: 100 }])).toEqual({ real: undefined, estimate: undefined });
  });
});
