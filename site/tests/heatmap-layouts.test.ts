import { describe, expect, it } from "vitest";
import { AKIHABARA_FLOOR } from "../lib/heatmap/akihabara-layout";
import { KABUKI_FLOOR } from "../lib/heatmap/kabuki-layout";

describe("transcribed store layouts", () => {
  it.each([
    ["Island", AKIHABARA_FLOOR, 385],
    ["Kabuki", KABUKI_FLOOR, 749],
  ] as const)("keeps %s numbered seats unique and within its source canvas", (_name, layout, count) => {
    expect(layout.seats).toHaveLength(count);
    expect(new Set(layout.seats.map((seat) => seat.unit)).size).toBe(count);
    expect(new Set(layout.seats.map((seat) => `${seat.x},${seat.y}`)).size).toBe(count);
    for (const seat of layout.seats) {
      expect(seat.x).toBeGreaterThanOrEqual(0);
      expect(seat.y).toBeGreaterThanOrEqual(0);
      expect(seat.width).toBeGreaterThan(0);
      expect(seat.height).toBeGreaterThan(0);
      expect(seat.x + seat.width).toBeLessThanOrEqual(layout.width);
      expect(seat.y + seat.height).toBeLessThanOrEqual(layout.height);
    }
    expect(layout.sourceUrl).toMatch(/^https:\/\//);
    expect(layout.layoutNote).toBeTruthy();
  });

  it("identifies Kabuki's separate floors and preserves the Island source's unknown date", () => {
    expect(KABUKI_FLOOR.labels?.map((label) => label.text).join(" ")).toMatch(/BF/);
    expect(KABUKI_FLOOR.labels?.map((label) => label.text).join(" ")).toMatch(/4F/);
    expect(AKIHABARA_FLOOR.asOf).toBe("配置基準日未記載");
  });
});
