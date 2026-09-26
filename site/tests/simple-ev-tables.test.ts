import { describe, expect, it } from "vitest";
import { simpleEvSet } from "@/lib/ev/simple-ev-tables";
import { HALLS } from "@/lib/halls";

describe("簡易期待値表（持ち込み）", () => {
  it("店舗選択の別枠ページ /machines/<id>/simple が店舗idとぶつからない", () => {
    expect(HALLS.map((hall) => hall.id)).not.toContain("simple");
  });

  it("リコリスは店舗を問わず表がある。他の機種には無い", () => {
    expect(simpleEvSet("lycoris")?.tables.map((t) => t.label)).toEqual(["全体", "朝一", "1連後", "2-4連後", "5-6連後", "7-9連後", "10連以上後"]);
    expect(simpleEvSet("hokuto")).toBeNull();
  });

  it("転記の取り違えが無い：10G刻み・機械割/期待値/時給の符号がそろう", () => {
    const set = simpleEvSet("lycoris")!;
    for (const table of set.tables) {
      table.rows.forEach(([g, rtp, ev, hourly, invest], index) => {
        expect(g).toBe(index * 10);
        // 朝一は提供された表が550Gまで（560G以降は無い。外挿で作らない）
        expect(table.rows.at(-1)![0]).toBe(table.key === "morning" ? 550 : 700);
        // 機械割100.0%は四捨五入の境目（5-6連後360Gは100.0%で-5円）なので符号を問わない
        if (rtp !== 100) expect(rtp > 100).toBe(ev > 0);
        expect(Math.sign(hourly)).toBe(Math.sign(ev));
        expect(invest).toBeGreaterThan(0);
      });
    }
  });
});
