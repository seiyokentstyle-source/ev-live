import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { EvFilter } from "../components/ev/EvFilter";
import { compatibleFilterSelection, declaredFilterAxes, groupProfiles, selectedFilterTable } from "../lib/ev/profiles";
import { validateMachine } from "../lib/ev/validate";
import type { DecodedFilterAggregation, FilterAxis, Profile } from "../lib/ev/types";

// Artificial totals: no machine histories or source identifiers belong in UI fixtures.
const axes: FilterAxis[] = [
  { key: "kaimon_count", label: "前回連チャン内の海門回想回数", allLabel: "不問",
    options: [{ value: "0", label: "0回" }, { value: "1", label: "1回" }, { value: "2", label: "2回" }] },
  { key: "kaimon_since_pay", label: "最後の海門回想後の獲得枚数", allLabel: "不問",
    options: [{ value: "0", label: "0～499枚" }, { value: "500", label: "500～999枚" }] },
  { key: "kaimon_day_seen", label: "前回連チャン差枚2,000枚以上・当日海門回想", allLabel: "不問",
    options: [{ value: "0", label: "なし" }, { value: "1", label: "あり" }] },
];
const aggregation: DecodedFilterAggregation = {
  schema: "evlive-filter-aggregates/v1", axisKeys: axes.map(axis => axis.key),
  costPerGame: 30, exchange: 20, medalsPerGame: 1.5, junzou: 4, bet: 3,
  investmentMinimum: "mean", roundingEpsilon: 1e-8,
  rows: [
    [0, 1, 1, 1, 2, 200, 1200],
    [0, 2, 1, 1, 3, 600, 1500],
    [0, 0, -1, 0, 1, 300, 400],
    [0, -1, -1, -1, 4, 800, 1000],
  ],
};
function upper(rate: "4652" | "5050" = "5050"): Profile {
  return {
    key: `game_ceiling_after_nonrunthrough_joui_${rate}`, aimKind: "at_non_runthrough",
    label: `上位後・${rate === "4652" ? "46/52" : "50/50"}`, ceiling: "650G",
    gRange: { start: 0, end: 650, step: 10 }, activeAxes: [], zones: [], sessions: 10,
    baseAnchors: [{ g: 0, ev: 200, rtp: 101, n: 10, inv: 285, playG: 292.5 }],
    evFilters: { axes, tables: {}, aggregation },
  };
}

describe("海門決戦の上位後の絞り込み", () => {
  it("shows all three declared controls under the upper aim and keeps exact exchange variants", () => {
    const profiles = [upper("4652"), upper("5050")];
    const machine = validateMachine({ ...fixture, id: "mcd43a818", profiles, setting1Correction: undefined });
    const [group] = groupProfiles(machine.profiles, machine.id).groups;
    expect(group.label).toBe("上位後");
    expect(Object.keys(group.variants)).toEqual(["4652", "5050"]);
    const declared = declaredFilterAxes(group.variants["5050"])!;
    const html = renderToStaticMarkup(createElement(EvFilter, {
      axes: declared, values: {}, multiple: true, onChange: () => {}, hits: 10,
    }));
    for (const axis of axes) expect(html).toContain(axis.label);
    expect(declared.map(axis => axis.allLabel)).toEqual(["不問", "不問", "不問"]);
  });

  it("intersects three filters and sums selected counts before calculating EV", () => {
    const selected = { kaimon_count: "1|2", kaimon_since_pay: "500", kaimon_day_seen: "1" };
    const table = selectedFilterTable(upper(), axes, selected)!;
    expect(table.hits).toBe(5);
    expect(table.totalPayout).toBe(2700);
    expect(table.baseAnchors[0]).toMatchObject({ g: 0, n: 5, ev: 6000, inv: 240, playG: 295 });
    // A condition missing from the data is empty, never replaced by an unfiltered table.
    expect(selectedFilterTable(upper(), axes, { ...selected, kaimon_day_seen: "0" })!.hits).toBe(0);
  });

  it("keeps zero and unobserved distinct, without inventing a last-recollection payout", () => {
    const noRecollection = selectedFilterTable(upper(), axes, { kaimon_count: "0", kaimon_day_seen: "0" })!;
    expect(noRecollection.hits).toBe(1);
    expect(noRecollection.baseAnchors[0].ev).toBe(-1000);
    expect(selectedFilterTable(upper(), axes, { kaimon_count: "0", kaimon_since_pay: "0" })!.hits).toBe(0);
    expect(selectedFilterTable(upper(), axes, { kaimon_day_seen: "0" })!.hits).toBe(1);
    expect(selectedFilterTable(upper(), axes, { kaimon_day_seen: "1" })!.hits).toBe(5);
  });

  it("preserves conditions across rates but clears upper-only conditions when changing aim", () => {
    const selection = { kaimon_count: "2", kaimon_since_pay: "500", kaimon_day_seen: "1" };
    expect(compatibleFilterSelection(upper("4652"), selection)).toEqual(selection);
    const reset = { ...upper(), key: "reset_5050", evFilters: { axes: [], tables: {} } };
    expect(declaredFilterAxes(reset)).toEqual([]);
    expect(compatibleFilterSelection(reset, selection)).toEqual({});
  });
});
