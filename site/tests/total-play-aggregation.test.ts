import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { decodeFilterAggregation, clearAggregationDecodeCache } from "../lib/ev/aggregation-decode";
import { aggregateFilterTable } from "../lib/ev/filter-aggregation";
import { validateAggregateRows } from "../lib/ev/filter-aggregation-validation";
import { validateMachine } from "../lib/ev/validate";
import { selectedFilterTable } from "../lib/ev/profiles";
import { externalizeMachineAggregations } from "../lib/filter-aggregate-assets.mjs";
import { splitCzThroughProfiles } from "../lib/cz-through-profiles.mjs";
import type { DecodedFilterAggregation, FilterAggregation, FilterAxis, Machine, Profile } from "../lib/ev/types";

const axes: FilterAxis[] = [{ key: "n", label: "前回連チャン数", allLabel: "不問",
  options: ["0", "1"].map(value => ({ value, label: value })) }];
const source = (): DecodedFilterAggregation => ({
  schema: "evlive-filter-aggregates/v2", axisKeys: ["n"], totalPlayGames: true,
  costPerGame: 30, exchange: 20, medalsPerGame: 1.5, junzou: 3, bet: 3,
  investmentMinimum: "mean", roundingEpsilon: 1e-8,
  // Same investment within each row; non-bonus time is independent of payout.
  rows: [[10, 0, 2, 200, 600, 520], [10, 1, 1, 50, 90, 120], [10, -1, 1, 30, 0, 70]],
});
const profile = (aggregation: FilterAggregation, declaredAxes = axes): Profile => ({
  key: "after_other_5050", aimKind: "at_non_runthrough", label: "駆け抜け後以外・50/50", ceiling: "AT当選で終了",
  gRange: { start: 10, end: 20, step: 10 }, activeAxes: [], zones: [],
  baseAnchors: [{ g: 10, n: 4, ev: 0, rtp: 100, inv: 105, playG: 177.5 }],
  evFilters: { axes: declaredAxes, tables: {}, aggregation },
});
const machine = (aggregation: FilterAggregation): Machine => ({ ...validateMachine(structuredClone(fixture)),
  setting1Correction: undefined, profiles: [profile(aggregation)] });
const packed = (data = source()): FilterAggregation => {
  const { rows, ...parameters } = data;
  return { ...parameters, rowsGzip: gzipSync(JSON.stringify(rows)).toString("base64"), rowCount: rows.length };
};
const rowsValid = (data: DecodedFilterAggregation) => validateAggregateRows(data.rows, axes,
  undefined, data.axisMatchModes, data.schema, data.totalPlayGames);

beforeEach(clearAggregationDecodeCache);
afterEach(() => { clearAggregationDecodeCache(); vi.unstubAllGlobals(); });

describe("explicit total play games", () => {
  it("changes RTP and time without charging non-bonus time as normal investment or adding bonus time twice", () => {
    const data = source();
    const exact = aggregateFilterTable(data, axes, { n: "0" }, 10).baseAnchors[0];
    const { totalPlayGames: _flag, ...legacy } = data;
    legacy.rows = data.rows.map(row => row.slice(0, -1));
    const old = aggregateFilterTable(legacy, axes, { n: "0" }, 10).baseAnchors[0];
    expect(exact).toMatchObject({ n: 2, ev: 3000, inv: 150, playG: 260 });
    expect(exact.rtp).toBeCloseTo(100 + 6000 / (60 * 520) * 100);
    expect(old).toMatchObject({ n: 2, ev: 3000, inv: 150, playG: 200, rtp: 125 });
  });

  it("sums total games with counts across selected cohorts and leaves unknowns unrestricted only", () => {
    const data = source(), before = structuredClone(data);
    const selected = aggregateFilterTable(data, axes, { n: "0|1" }, 10).baseAnchors[0];
    expect(selected).toMatchObject({ n: 3, ev: 2100, inv: 125 });
    expect(selected.playG).toBeCloseTo(640 / 3);
    expect(selected.rtp).toBeCloseTo(100 + 6300 / (60 * 640) * 100);
    expect(aggregateFilterTable(data, axes, { n: "1|0" }, 10).baseAnchors[0]).toEqual(selected);
    expect(aggregateFilterTable(data, axes, {}, 10).baseAnchors[0].playG).toBe(710 / 4);
    expect(data).toEqual(before);
  });

  it("retains exact per-investment held-medal caps and the same play denominator", () => {
    const data = { ...source(), costPerGame: 1.5 * 1000 / 46, exchange: 1000 / 52 };
    const result = selectedFilterTable(profile(data), axes, { n: "0|1" }, data, 100)!.baseAnchors[0];
    const profit = 690 * 1000 / 52 - 250 * 1.5 * 1000 / 46
      + 275 * (1000 / 46 - 1000 / 52);
    expect(result.ev).toBe(Math.round(profit / 3));
    expect(result.inv).toBe(125);
    expect(result.playG).toBe(640 / 3);
    expect(result.rtp).toBeCloseTo(100 + profit / (60 * 640) * 100);
  });

  it("keeps minPlay tied to normal investment and permits signed payout with positive total time", () => {
    const data = { ...source(), rows: [[10, 0, 1, 10, -3, 100]], minPlay: 11 };
    expect(rowsValid(data)).toEqual(data.rows);
    expect(aggregateFilterTable(data, axes, {}, 10).baseAnchors).toEqual([]);
    const result = aggregateFilterTable({ ...data, minPlay: 10 }, axes, {}, 10).baseAnchors[0];
    expect(result).toMatchObject({ ev: -360, inv: 15, playG: 100, rtp: 94 });
  });

  it("uses bitmask union membership once while summing the explicit time", () => {
    const data = { ...source(), axisMatchModes: ["bitmask" as const],
      rows: [[10, 3, 2, 200, 600, 520], [10, 1, 1, 50, 90, 120]] };
    expect(rowsValid(data)).toEqual(data.rows);
    const result = aggregateFilterTable(data, axes, { n: "0|1" }, 10).baseAnchors[0];
    expect(result.n).toBe(3);
    expect(result.playG).toBe(640 / 3);
  });
});

describe("total-play row contract at public boundaries", () => {
  it.each([false, true])("validates and decodes inline rows (gzip=%s)", async gzip => {
    const data = source(), encoded = gzip ? packed(data) : data;
    expect(validateMachine(machine(encoded)).profiles[0].evFilters!.aggregation!.totalPlayGames).toBe(true);
    expect(await decodeFilterAggregation(encoded, axes)).toEqual(data);
  });

  it.each([false, true])("preserves metadata through externalization and checks asset rows (gzip=%s)", async gzip => {
    const data = source(), assets = new Map<string, string>();
    const exported = externalizeMachineAggregations(machine(gzip ? packed(data) : data),
      (hash, body) => assets.set(hash, body));
    const aggregate = exported.profiles[0].evFilters!.aggregation!;
    expect(aggregate.totalPlayGames).toBe(true);
    expect(aggregate.rows).toBeUndefined();
    const body = assets.get(aggregate.rowsAsset!.sha256)!;
    expect(Object.keys(JSON.parse(body))).toEqual(gzip ? ["rowsGzip", "rowCount"] : ["rows"]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
    expect(await decodeFilterAggregation(aggregate, axes)).toEqual(data);
  });

  it.each([
    ["false flag", { totalPlayGames: false }],
    ["numeric flag", { totalPlayGames: 1 }],
    ["v1 flag", { schema: "evlive-filter-aggregates/v1" }],
    ["missing time", { rows: [[10, 0, 2, 200, 600]] }],
    ["extra time without flag", { totalPlayGames: undefined }],
    ["time below paid normal", { rows: [[10, 0, 2, 200, 600, 199]] }],
    ["negative time", { rows: [[10, 0, 1, 0, 0, -1]] }],
    ["nonfinite time", { rows: [[10, 0, 1, 10, 0, Infinity]] }],
    ["zero samples", { rows: [[10, 0, 0, 0, 0, 0]] }],
    ["duplicate investment cell", { rows: [[10, 0, 1, 100, 300, 260], [10, 0, 2, 200, 600, 540]] }],
  ])("rejects %s without accepting a different denominator", async (_name, patch) => {
    const data = { ...source(), ...patch } as DecodedFilterAggregation;
    expect(() => validateMachine(machine(data))).toThrow();
    await expect(decodeFilterAggregation(data, axes)).rejects.toThrow();
  });

  it("revalidates a changed time interpretation instead of reusing cached decoded rows", async () => {
    const encoded = packed();
    await decodeFilterAggregation(encoded, axes);
    delete encoded.totalPlayGames;
    await expect(decodeFilterAggregation(encoded, axes)).rejects.toThrow(/row shape/);
  });

  it.each([false, true])("preserves the time column when removing the CZ axis (gzip=%s)", async gzip => {
    const czAxes = [{ ...axes[0], key: "cz" }];
    const data = { ...source(), axisKeys: ["cz"],
      rows: [[10, 0, 2, 200, 600, 520], [10, 1, 1, 50, 90, 120]] };
    const original = { ...machine(data), id: "vvv2", profiles: [{
      ...profile(gzip ? packed(data) : data, czAxes), key: "cz_ceiling_5050", aimKind: "cz" as const,
    }] };
    const result = splitCzThroughProfiles(original);
    expect(result.profiles).toHaveLength(2);
    expect(result.profiles[0].baseAnchors[0]).toMatchObject({ n: 2, playG: 260, inv: 150, ev: 3000 });
    expect(result.profiles[1].baseAnchors[0]).toMatchObject({ n: 1, playG: 120, inv: 75, ev: 300 });
    const zero = result.profiles[0];
    expect((await decodeFilterAggregation(zero.evFilters!.aggregation!, zero.evFilters!.axes!)).rows)
      .toEqual([[10, 2, 200, 600, 520]]);
  });
});
