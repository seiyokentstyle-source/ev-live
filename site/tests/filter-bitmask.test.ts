import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { decodeFilterAggregation } from "../lib/ev/aggregation-decode";
import { aggregateFilterTable } from "../lib/ev/filter-aggregation";
import { validateAggregateMatchModes, validateAggregateRows } from "../lib/ev/filter-aggregation-validation";
import { validateMachine } from "../lib/ev/validate";
import type { DecodedFilterAggregation, FilterAggregation, FilterAxis, Profile } from "../lib/ev/types";

const axes: FilterAxis[] = [
  { key: "d", label: "特定日", allLabel: "不問", options: ["1", "3", "7"].map(value => ({ value, label: `${value}のつく日` })) },
  { key: "c", label: "CZスルー回数", allLabel: "不問", options: ["0", "1"].map(value => ({ value, label: value })) }
];
const aggregate: DecodedFilterAggregation = {
  schema: "evlive-filter-aggregates/v1", axisKeys: ["d", "c"], axisMatchModes: ["bitmask", "single"],
  costPerGame: 30, exchange: 20, medalsPerGame: 1.5, junzou: 3, bet: 3,
  investmentMinimum: "mean", roundingEpsilon: 1e-8,
  rows: [[1, 3, 0, 2, 200, 600], [1, 1, 0, 1, 100, 300], [1, 2, 0, 3, 300, 900],
    [1, 4, 1, 5, 500, 1500], [1, -1, 0, 7, 700, 2100]]
};
const machine = (value: FilterAggregation, filterAxes = axes) => ({ ...fixture, setting1Correction: undefined, profiles: [{
  key: "normal_5050", aimKind: "at_non_runthrough", label: "AT間", ceiling: "100G",
  gRange: { start: 1, end: 100, step: 10 }, activeAxes: [], zones: [],
  baseAnchors: [{ g: 1, ev: 0, rtp: 100 }],
  evFilters: { axes: filterAxes, tables: {}, aggregation: value }
} as Profile] });

describe("overlapping day-digit conditions", () => {
  it("counts the 13th in both the 1-day and 3-day selections without duplicating unrestricted counts", () => {
    expect(aggregateFilterTable(aggregate, axes, { d: "1" }, 1).hits).toBe(3);
    expect(aggregateFilterTable(aggregate, axes, { d: "3" }, 1).hits).toBe(5);
    expect(aggregateFilterTable(aggregate, axes, { d: "7" }, 1).hits).toBe(5);
    expect(aggregateFilterTable(aggregate, axes, {}, 1).hits).toBe(18);
    expect(aggregate.rows).toHaveLength(5);
  });
  it("applies the bitmask as an AND condition alongside single-match axes", () => {
    expect(aggregateFilterTable(aggregate, axes, { d: "1", c: "0" }, 1).hits).toBe(3);
    expect(aggregateFilterTable(aggregate, axes, { d: "3", c: "1" }, 1).hits).toBe(0);
    expect(aggregateFilterTable(aggregate, axes, { d: "7", c: "1" }, 1).hits).toBe(5);
    expect(aggregateFilterTable(aggregate, axes, { c: "0" }, 1).hits).toBe(13);
  });
  it("keeps unknown masks in unrestricted counts but never matches them to a selected digit", () => {
    const value = { ...aggregate, rows: [[1, -1, 0, 1, 100, 300], [1, 0, 0, 1, 100, 300]] };
    expect(aggregateFilterTable(value, axes, { c: "0" }, 1).hits).toBe(2);
    expect(aggregateFilterTable(value, axes, { d: "1" }, 1).hits).toBe(0);
  });
  it("treats an omitted mode array as the old single-index contract", () => {
    const { axisMatchModes: _modes, ...base } = aggregate;
    const value = { ...base, rows: [[1, 1, 0, 1, 100, 300]] };
    expect(aggregateFilterTable(value, axes, { d: "3" }, 1).hits).toBe(1);
    expect(aggregateFilterTable(value, axes, { d: "1" }, 1).hits).toBe(0);
    expect(validateMachine(machine(value)).profiles[0].evFilters?.aggregation?.axisMatchModes).toBeUndefined();
  });
  it("validates and decodes gzip with the same bitmask rules", async () => {
    const { rows, ...parameters } = aggregate;
    const encoded: FilterAggregation = { ...parameters, rowsGzip: gzipSync(JSON.stringify(rows)).toString("base64"), rowCount: rows.length };
    validateMachine(machine(encoded));
    const decoded = await decodeFilterAggregation(encoded, axes);
    expect(decoded).toEqual(aggregate);
    expect(aggregateFilterTable(decoded, axes, { d: "3" }, 1).hits).toBe(5);
    const invalid = { ...encoded, rowsGzip: gzipSync(JSON.stringify([[1, 8, 0, 1, 100, 300]])).toString("base64"), rowCount: 1 };
    await expect(decodeFilterAggregation(invalid, axes)).rejects.toThrow(/bitmask/);
  });
});

describe("bitmask bounds", () => {
  it.each([{ modes: ["bitmask"] }, { modes: ["bitmask", "unknown"] }, { modes: ["single", "single", "single"] }])("rejects inconsistent mode declarations $modes", ({ modes }) => {
    expect(() => validateAggregateMatchModes(modes, axes)).toThrow(/axisMatchModes/);
  });
  it.each([-2, 1.5, 8])("rejects an out-of-domain three-option mask %s", mask => {
    expect(() => validateAggregateRows([[1, mask, 0, 1, 100, 300]], axes, undefined, aggregate.axisMatchModes)).toThrow(/bitmask/);
  });
  it("supports bits 0 through 29 and rejects a 31st option", () => {
    const thirty = [{ key: "d", label: "test", allLabel: "不問", options: Array.from({ length: 30 }, (_, i) => ({ value: String(i), label: String(i) })) }];
    expect(validateAggregateRows([[1, 2 ** 30 - 1, 1, 100, 300]], thirty, 1, ["bitmask"])).toHaveLength(1);
    expect(() => validateAggregateRows([[1, 2 ** 30, 1, 100, 300]], thirty, 1, ["bitmask"])).toThrow(/bitmask/);
    const tooMany = [{ ...thirty[0], options: [...thirty[0].options, { value: "30", label: "30" }] }];
    expect(() => validateMachine(machine({ ...aggregate, axisKeys: ["d"], axisMatchModes: ["bitmask"], rows: [] }, tooMany))).toThrow(/30 options/);
    const value = { ...aggregate, axisKeys: ["d"], axisMatchModes: ["bitmask"] as const, rows: [[1, 2 ** 29, 1, 100, 300]] };
    expect(aggregateFilterTable({ ...value, axisMatchModes: ["bitmask"] }, thirty, { d: "29" }, 1).hits).toBe(1);
  });
});
