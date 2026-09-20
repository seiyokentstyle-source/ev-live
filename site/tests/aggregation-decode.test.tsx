import { gzipSync } from "node:zlib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { beginAggregationDecode, clearAggregationDecodeCache, decodeFilterAggregation } from "../lib/ev/aggregation-decode";
import { useFilterAggregation } from "../lib/ev/use-filter-aggregation";
import { selectedFilterTable } from "../lib/ev/profiles";
import { validateMachine } from "../lib/ev/validate";
import type { DecodedFilterAggregation, FilterAggregation, FilterAxis, Profile } from "../lib/ev/types";

const axes: FilterAxis[] = [{ key: "c", label: "CZスルー回数", allLabel: "不問", options: [{ value: "0", label: "0スルー" }] }];
const raw: DecodedFilterAggregation = { schema: "evlive-filter-aggregates/v1", axisKeys: ["c"],
  rows: [[1, 0, 2, 200, 600]], costPerGame: 30, exchange: 20, medalsPerGame: 1.5,
  junzou: 3, bet: 3, investmentMinimum: "mean", roundingEpsilon: 1e-8 };
const packed = (rows: unknown = raw.rows, rowCount = raw.rows.length): FilterAggregation => {
  const { rows: _rows, ...rest } = raw;
  return { ...rest, rowsGzip: gzipSync(JSON.stringify(rows)).toString("base64"), rowCount };
};
const profile = (aggregation: FilterAggregation): Profile => ({ key: "cz_5050", aimKind: "cz", label: "CZ間", ceiling: "100G",
  gRange: { start: 1, end: 100, step: 10 }, activeAxes: [], baseAnchors: [{ g: 1, ev: 0, rtp: 100 }], zones: [],
  evFilters: { tails: [], days: [], cz: [], axes, tables: {}, aggregation } });
const machine = (aggregation: FilterAggregation) => ({ ...fixture, profiles: [profile(aggregation)], setting1Correction: undefined });

beforeEach(clearAggregationDecodeCache);

describe("lazy compressed aggregate decoding", () => {
  it("decodes to the same exact table as plain rows without changing the compressed source", async () => {
    const source = packed(), before = JSON.stringify(source);
    const decoded = await decodeFilterAggregation(source, axes);
    expect(decoded).toEqual(raw);
    expect(selectedFilterTable(profile(source), axes, { c: "0" }, decoded))
      .toEqual(selectedFilterTable(profile(raw), axes, { c: "0" }));
    expect(JSON.stringify(source)).toBe(before);
  });
  it("never substitutes unfiltered data before compressed rows have loaded", () => {
    const source = packed();
    expect(selectedFilterTable(profile(source), axes, { c: "0" })).toBeUndefined();
    function Probe({ requested }: { requested: boolean }) {
      const state = useFilterAggregation(source, axes, requested);
      return createElement("span", null, state.status);
    }
    expect(renderToStaticMarkup(createElement(Probe, { requested: false }))).toContain("idle");
    expect(renderToStaticMarkup(createElement(Probe, { requested: true }))).toContain("loading");
  });
  it("shares requests but only keeps two recent decoded profiles", async () => {
    const one = packed(), two = packed(), three = packed();
    const first = decodeFilterAggregation(one, axes);
    expect(decodeFilterAggregation(one, axes)).toBe(first);
    await Promise.all([first, decodeFilterAggregation(two, axes)]);
    await decodeFilterAggregation(three, axes);
    expect(decodeFilterAggregation(one, axes)).not.toBe(first);
  });
  it("cancels an evicted in-flight expansion so rapid tab changes do not expand every profile", async () => {
    const first = decodeFilterAggregation(packed(), axes);
    const second = decodeFilterAggregation(packed(), axes);
    const third = decodeFilterAggregation(packed(), axes);
    const results = await Promise.allSettled([first, second, third]);
    expect(results.map(result => result.status)).toEqual(["rejected", "fulfilled", "fulfilled"]);
  });
  it("does not deliver an old profile result or error after a selection/revision change", async () => {
    let resolve!: (value: DecodedFilterAggregation) => void;
    const pending = new Promise<DecodedFilterAggregation>(done => { resolve = done; });
    const ready = vi.fn(), failed = vi.fn();
    const cancel = beginAggregationDecode(packed(), axes, ready, failed, () => pending);
    cancel(); resolve(raw); await pending; await Promise.resolve();
    expect(ready).not.toHaveBeenCalled(); expect(failed).not.toHaveBeenCalled();
    let reject!: () => void;
    const rejected = new Promise<DecodedFilterAggregation>((_done, fail) => { reject = () => fail(new Error("stale")); });
    const cancelError = beginAggregationDecode(packed(), axes, ready, failed, () => rejected);
    cancelError(); reject(); await rejected.catch(() => {}); await Promise.resolve();
    expect(failed).not.toHaveBeenCalled();
  });
  it("validates row counts and all row fields after decompression", async () => {
    await expect(decodeFilterAggregation(packed(raw.rows, 2), axes)).rejects.toThrow(/row count/);
    await expect(decodeFilterAggregation(packed([[1, 99, 2, 200, 600]]), axes)).rejects.toThrow(/option index/);
    await expect(decodeFilterAggregation(packed([{ unit: "not allowed" }]), axes)).rejects.toThrow(/row shape/);
  });
  it("removes failed requests from the cache so retry does not keep a rejected promise", async () => {
    const source = { ...packed(), rowsGzip: "bm90LWd6aXA=" } as FilterAggregation;
    const failed = decodeFilterAggregation(source, axes);
    await expect(failed).rejects.toThrow();
    const retry = decodeFilterAggregation(source, axes);
    expect(retry).not.toBe(failed);
    await expect(retry).rejects.toThrow();
  });
});

describe("compressed envelope contract", () => {
  it("keeps gzip compressed during machine validation and publication", () => {
    const source = packed();
    const value = validateMachine(machine(source));
    expect(value.profiles[0].evFilters?.aggregation).toEqual(source);
    expect(value.profiles[0].evFilters?.aggregation?.rows).toBeUndefined();
  });
  it.each([
    { rows: raw.rows }, { rowCount: -1 }, { rowCount: 0.5 }, { rowsGzip: "not base64!" },
    { rowsGzip: "" }, { sourceEvents: [] }
  ])("rejects a malformed or mixed compressed shape %j", patch => {
    expect(() => validateMachine(machine({ ...packed(), ...patch } as FilterAggregation))).toThrow(/aggregation/);
  });
});
