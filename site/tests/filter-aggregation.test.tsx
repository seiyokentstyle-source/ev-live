import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { EvFilter } from "../components/ev/EvFilter";
import { aggregateFilterTable, roundAggregateEV } from "../lib/ev/filter-aggregation";
import { selectedFilterTable } from "../lib/ev/profiles";
import { validateMachine } from "../lib/ev/validate";
import type { FilterAggregation, FilterAxis, Profile } from "../lib/ev/types";

const axes: FilterAxis[] = ["c", "p"].map(key => ({ key, label: key, allLabel: "不問",
  options: [{ value: "0", label: "0" }, { value: "1", label: "1" }] }));
const aggregation: FilterAggregation = {
  schema: "evlive-filter-aggregates/v1", axisKeys: ["c", "p"],
  costPerGame: 30, exchange: 20, medalsPerGame: 1.5, junzou: 3, bet: 3,
  investmentMinimum: "mean", roundingEpsilon: 1e-8,
  rows: [
    [1, 0, 0, 1, 100, 300], [1, 0, 1, 3, 600, 1800],
    [1, -1, 0, 2, 200, 100], [1, 1, 1, 10, 100, 1000],
    [10, 0, 0, 1, 91, 300], [10, 0, 1, 3, 573, 1800],
    [20, 0, 0, 0, 0, 0]
  ]
};
const profile: Profile = {
  key: "at_5050", aimKind: "at_non_runthrough", label: "AT間・駆け抜け後以外・50/50", ceiling: "100G",
  gRange: { start: 1, end: 100, step: 10 }, activeAxes: [], zones: [],
  baseAnchors: [{ g: 1, ev: 100, rtp: 101, n: 100 }, { g: 100, ev: 200, rtp: 102, n: 20 }],
  evFilters: { tails: [], days: [], cz: [], axes, tables: {}, aggregation }
};
const machineWith = (value: FilterAggregation) => ({ ...fixture, setting1Correction: undefined,
  profiles: [{ ...profile, evFilters: { ...profile.evFilters!, aggregation: value } }] });

describe("public filter aggregate calculation", () => {
  it.each([[0.5, 0], [1.5, 2], [2.5, 2], [-0.5, 0], [-1.5, -2], [-2.5, -2],
    [2.5 + 1e-9, 2], [2.5 - 1e-9, 2], [-1.5 + 1e-9, -2], [-1.5 - 1e-9, -2],
    [2.5 + 1e-7, 3], [-1.5 + 1e-7, -1]])("matches Python half-even rounding for %s", (value, expected) => {
    expect(roundAggregateEV(value)).toBe(expected);
  });
  it("sums counts and totals before calculating averages and rates", () => {
    const result = aggregateFilterTable(aggregation, axes, { c: "0" }, 1);
    expect(result.baseAnchors[0]).toMatchObject({ g: 1, n: 4, ev: 5250, inv: 262.5, playG: 350, rtp: 125 });
    expect(result.baseAnchors.map(anchor => anchor.g)).toEqual([1, 10]);
    expect(result).toMatchObject({ hits: 4, start: 1, end: 10, totalPayout: 2100, firstHitRate: null });
    expect(result.units).toBeUndefined();
    // セルのEVを単純平均した場合の6000円ではない。
    expect(result.baseAnchors[0].ev).not.toBe(6000);
  });
  it("includes unknown values only when that axis is unrestricted", () => {
    expect(aggregateFilterTable(aggregation, axes, { p: "0" }, 1).baseAnchors[0].n).toBe(3);
    expect(aggregateFilterTable(aggregation, axes, { c: "0", p: "0" }, 1).baseAnchors[0].n).toBe(1);
  });
  it("retains one-anchor and one-sample results, with no minimum sample threshold", () => {
    const one = aggregateFilterTable(aggregation, axes, { c: "1", p: "1" }, 1);
    expect(one.baseAnchors).toHaveLength(1);
    const sparse = { ...aggregation, rows: [[1, 0, 0, 1, 100, 300]] };
    expect(aggregateFilterTable(sparse, axes, { c: "0" }, 1).baseAnchors[0].n).toBe(1);
  });
  it("uses aggregate intersections ahead of legacy tables and leaves all-unrestricted data to the base profile", () => {
    const value = { ...profile, evFilters: { ...profile.evFilters!, tables: {
      c0: { baseAnchors: [], end: 100, totalPayout: 0, firstHitRate: null, units: 0, hits: 0 }
    } } };
    expect(selectedFilterTable(value, axes, { c: "0" })?.baseAnchors[0].n).toBe(4);
    expect(selectedFilterTable(value, axes, {})).toBeUndefined();
    expect(profile.baseAnchors[0].n).toBe(100);
  });
  it("returns an empty exact cohort without falling back to unrestricted values", () => {
    const result = selectedFilterTable(profile, axes, { c: "1", p: "0" });
    expect(result).toMatchObject({ baseAnchors: [], hits: 0 });
  });
  it("applies cash-exchange economics from the aggregate contract", () => {
    const data = { ...aggregation, costPerGame: 1.5 * 1000 / 46, exchange: 1000 / 52 };
    const result = aggregateFilterTable(data, axes, { c: "0" }, 1).baseAnchors[0];
    const profit = 2100 * 1000 / 52 - 700 * 1.5 * 1000 / 46;
    expect(result.ev).toBe(Math.round(profit / 4));
    expect(result.rtp).toBeCloseTo(100 + profit / (20 * 3 * 1400) * 100);
    expect(result.playG).toBe(350);
  });
  it("omits unavailable unit counts instead of showing zero units for a nonempty cohort", () => {
    const html = renderToStaticMarkup(createElement(EvFilter, { axes, values: { c: "0" }, onChange: () => {}, hits: 4 }));
    expect(html).toContain("4件");
    expect(html).not.toContain("0台");
  });
  it("applies minimum investment and normal-play rules after merging matching cells", () => {
    const data = { ...aggregation, costPerGame: 1, minPlay: 0.8,
      rows: [[1, 0, 0, 1, 0.5, 1], [1, 0, 1, 1, 1.5, 1]] };
    expect(aggregateFilterTable(data, axes, { c: "0" }, 1).baseAnchors[0].n).toBe(2);
    expect(aggregateFilterTable(data, axes, { c: "0", p: "0" }, 1).baseAnchors).toEqual([]);
    const small = { ...aggregation, rows: [[1, 0, 0, 100, 1, 300]] };
    expect(aggregateFilterTable(small, axes, { c: "0" }, 1).baseAnchors).toEqual([]);
    expect(aggregateFilterTable({ ...small, investmentMinimum: "total" }, axes, { c: "0" }, 1).baseAnchors).toHaveLength(1);
    expect(aggregateFilterTable({ ...small, investmentMinimum: "total", minPlay: 1 }, axes, { c: "0" }, 1).baseAnchors).toEqual([]);
  });
  it("uses the producer's rounding tolerance", () => {
    const data = { ...aggregation, costPerGame: 2.50000005, rows: [[1, 0, 0, 1, 1, 0]] };
    expect(aggregateFilterTable(data, axes, { c: "0" }, 1).baseAnchors[0].ev).toBe(-3);
    expect(aggregateFilterTable({ ...data, roundingEpsilon: 1e-6 }, axes, { c: "0" }, 1).baseAnchors[0].ev).toBe(-2);
  });
});

describe("aggregate contract validation", () => {
  it("accepts aggregate rows without exposing original units, dates or events", () => {
    expect(validateMachine(machineWith(aggregation)).profiles[0].evFilters?.aggregation).toEqual(aggregation);
  });
  it("allows one base anchor only on the new aggregate contract", () => {
    const value = machineWith(aggregation);
    value.profiles[0].baseAnchors = [profile.baseAnchors[0]];
    expect(validateMachine(value).profiles[0].baseAnchors).toHaveLength(1);
    const legacy = { ...value, profiles: [{ ...value.profiles[0], evFilters: undefined }] };
    expect(() => validateMachine(legacy)).toThrow(/anchors/);
  });
  it.each([
    { axisKeys: ["p", "c"] },
    { rows: [[1, 0, 0, 1, 100]] },
    { rows: [[1, 2, 0, 1, 100, 300]] },
    { rows: [[1, -2, 0, 1, 100, 300]] },
    { rows: [[1, 0, 0, 0, 100, 300]] },
    { rows: [aggregation.rows[0], aggregation.rows[0]] },
    { costPerGame: Number.NaN }, { exchange: 0 }, { junzou: -1 },
    { investmentMinimum: "unsupported" }, { minPlay: -1 }, { roundingEpsilon: 0.25 },
    { events: ["unexpected source records"] }
  ])("rejects invalid aggregate payload %j", patch => {
    expect(() => validateMachine(machineWith({ ...aggregation, ...patch }))).toThrow(/aggregation/);
  });
});
