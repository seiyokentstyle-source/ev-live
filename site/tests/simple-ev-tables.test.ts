import { describe, expect, it } from "vitest";
import { simpleEvSet } from "@/lib/ev/simple-ev-tables";

describe("簡易期待値表（持ち込み）", () => {
  it("リコリスは店舗を問わず表がある。他の機種には無い", () => {
    expect(simpleEvSet("lycoris")?.tables.map((t) => t.label)).toEqual(["1連後", "2-4連後"]);
    expect(simpleEvSet("hokuto")).toBeNull();
  });

  it("転記の取り違えが無い：10G刻み・機械割/期待値/時給の符号がそろう", () => {
    const set = simpleEvSet("lycoris")!;
    for (const table of set.tables) {
      table.rows.forEach(([g, rtp, ev, hourly, invest], index) => {
        expect(g).toBe(index * 10);
        expect(rtp >= 100).toBe(ev >= 0);
        expect(Math.sign(hourly)).toBe(Math.sign(ev));
        expect(invest).toBeGreaterThan(0);
      });
    }
  });
});
