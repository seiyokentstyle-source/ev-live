import { describe, expect, it } from "vitest";
import { getHall, getReadyHalls, getVisibleHalls, HALLS, isListedHall, type Hall } from "../lib/halls";

describe("hall visibility and order", () => {
  it("retains mixed-only metadata but excludes it from public selectors and ready routes", () => {
    expect(getHall("akiba_espace")).toMatchObject({ ready: true, dataSubdir: "akiba_espace", visibility: "mixed-only" });
    expect(HALLS.some(hall => hall.id === "akiba_espace")).toBe(true);
    expect(getVisibleHalls().map(hall => hall.id)).toEqual(["mixed", "mixed-raw", "shinjuku", "kabuki", "akihabara"]);
    expect(getReadyHalls().map(hall => hall.id)).toEqual(["mixed", "mixed-raw", "shinjuku", "kabuki"]);
    expect(isListedHall(undefined)).toBe(false);
    expect(isListedHall(getHall("shinjuku"))).toBe(true);
  });

  it("orders future registered halls by region without inventing stores or changing registration order", () => {
    const template = getHall("kabuki")!;
    const hall = (id: string, area: string, visibility?: Hall["visibility"]): Hall => ({ ...template, id, area, visibility });
    const input = [hall("other", "大阪"), hall("akiba1", "秋葉原"), hall("new-hidden", "新宿", "mixed-only"),
      hall("ike2", "池袋", "listed"), hall("shin2", "新宿"), hall("ike1", "池袋"), hall("akiba2", "秋葉原"),
      hall("mixed-raw", "店舗混合"), hall("shin1", "新宿"), hall("mixed", "店舗混合")];
    const before = [...input];
    expect(getVisibleHalls(input).map(hall => hall.id)).toEqual([
      "mixed", "mixed-raw", "shin2", "shin1", "ike2", "ike1", "akiba1", "akiba2", "other",
    ]);
    expect(input).toEqual(before);
    expect(getVisibleHalls().some(hall => hall.area === "池袋")).toBe(false);
  });
});
