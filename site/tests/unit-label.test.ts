import { describe, expect, it } from "vitest";
import { parseUnitLabel, unitTail } from "@/lib/ev/unit-label";

describe("unit label (2026-10-20: 店舗混合の台番号を読みやすく)", () => {
  it("splits a mixed-hall unit into a short public hall name and the number", () => {
    expect(parseUnitLabel("espace_shibuya_shinkan:2252")).toEqual({ hall: "渋谷新館", number: "2252" });
    expect(parseUnitLabel("kabuki:54")).toEqual({ hall: "歌舞伎", number: "54" });
    expect(parseUnitLabel("shinjuku:683")).toEqual({ hall: "ゴジラ", number: "683" });
  });
  it("keeps single-hall units and unknown halls readable", () => {
    expect(parseUnitLabel("683")).toEqual({ hall: null, number: "683" });
    expect(parseUnitLabel("new_hall:7")).toEqual({ hall: "new_hall", number: "7" });
  });
  it("uses only the unit number for the tail filter", () => {
    expect(unitTail("seibu_shinjuku:3145")).toBe("5");
    expect(unitTail("ueno_honkan:12")).toBe("2");
    expect(unitTail("683")).toBe("3");
  });
});
