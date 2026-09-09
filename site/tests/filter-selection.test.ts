import { describe, expect, test } from "vitest";
import { compatibleFilterSelection } from "../lib/ev/profiles";
import type { EvFilterTable, Profile } from "../lib/ev/types";

const table: EvFilterTable = {
  units: 2,
  hits: 20,
  end: 100,
  totalPayout: 1000,
  firstHitRate: 100,
  baseAnchors: [{ g: 0, ev: 0, rtp: 100 }, { g: 100, ev: 100, rtp: 110 }]
};
const reset: Profile = {
  key: "reset_4652",
  label: "朝一",
  ceiling: "100G",
  gRange: { start: 0, end: 100, step: 10 },
  activeAxes: [],
  baseAnchors: table.baseAnchors,
  zones: [],
  evFilters: {
    tails: ["1"], days: ["7"], cz: [],
    axes: [
      { key: "t", label: "末尾", allLabel: "全部", options: [{ value: "1", label: "末尾1" }] },
      { key: "d", label: "特定日", allLabel: "全日", options: [{ value: "7", label: "7のつく日" }] },
      { key: "m", label: "MY", allLabel: "全部", options: [{ value: "0", label: "1000枚未満" }] }
    ],
    tables: { t1: table, d7: table, m0: table, t1d7: table }
  }
};

describe("profile changes and EV filters", () => {
  test("drops a normal-play MY value unavailable after switching to reset", () => {
    expect(compatibleFilterSelection(reset, { m: "1000" })).toEqual({});
  });

  test("keeps compatible selections while removing missing axes and values", () => {
    const selection = { t: "1", d: "7", m: "1000", c: "2" };
    expect(compatibleFilterSelection(reset, selection)).toEqual({ t: "1", d: "7" });
    expect(selection).toEqual({ t: "1", d: "7", m: "1000", c: "2" });
  });

  test("clears individually valid filters when their combination has no table", () => {
    expect(compatibleFilterSelection(reset, { t: "1", m: "0" })).toEqual({});
  });

  test("treats zero as a valid option", () => {
    expect(compatibleFilterSelection(reset, { m: "0" })).toEqual({ m: "0" });
  });

  test("clears filters when the next profile has no filter metadata", () => {
    expect(compatibleFilterSelection({ ...reset, evFilters: undefined }, { m: "1000" })).toEqual({});
  });
});
