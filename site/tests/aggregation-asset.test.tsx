import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { aggregationAssetPath, validateAggregationAssetPayload, validateAggregationRowsAsset } from "../lib/ev/aggregation-asset";
import { beginAggregationDecode, clearAggregationDecodeCache, decodeFilterAggregation } from "../lib/ev/aggregation-decode";
import { useFilterAggregation } from "../lib/ev/use-filter-aggregation";
import { selectedFilterTable } from "../lib/ev/profiles";
import { validateMachine } from "../lib/ev/validate";
import type { DecodedFilterAggregation, FilterAggregation, FilterAxis, Profile } from "../lib/ev/types";

const axes: FilterAxis[] = [{ key: "c", label: "CZスルー回数", allLabel: "不問", options: [{ value: "0", label: "0スルー" }] }];
const raw: DecodedFilterAggregation = { schema: "evlive-filter-aggregates/v1", axisKeys: ["c"],
  rows: [[1, 0, 2, 200, 600]], costPerGame: 30, exchange: 20, medalsPerGame: 1.5,
  junzou: 3, bet: 3, investmentMinimum: "mean", roundingEpsilon: 1e-8 };
function asset(payload: unknown = { rows: raw.rows }, rowCount = raw.rows.length) {
  const body = JSON.stringify(payload);
  const { rows: _rows, ...parameters } = raw;
  const source: FilterAggregation = { ...parameters, rowsAsset: { sha256: createHash("sha256").update(body).digest("hex"), rowCount } };
  return { body, source };
}
const profile = (aggregation: FilterAggregation): Profile => ({ key: "cz_5050", aimKind: "cz", label: "CZ間", ceiling: "100G",
  gRange: { start: 1, end: 100, step: 10 }, activeAxes: [], baseAnchors: [{ g: 1, ev: 999, rtp: 123, n: 100 }], zones: [],
  evFilters: { axes, tables: {}, aggregation } });
const machine = (aggregation: FilterAggregation) => ({ ...fixture, profiles: [profile(aggregation)], setting1Correction: undefined });
const fetchBody = (body: string) => vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(body)));

beforeEach(clearAggregationDecodeCache);
afterEach(() => { clearAggregationDecodeCache(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("external aggregate loading", () => {
  it.each([false, true])("loads and verifies a %s compressed asset only when requested", async compressed => {
    const item = asset(compressed ? { rowsGzip: gzipSync(JSON.stringify(raw.rows)).toString("base64"), rowCount: 1 } : { rows: raw.rows });
    fetchBody(item.body);
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/ev-live");
    expect(validateMachine(machine(item.source)).profiles[0].evFilters?.aggregation).toEqual(item.source);
    expect(fetch).not.toHaveBeenCalled();
    function Probe() { return createElement("span", null, useFilterAggregation(item.source, axes, false).status); }
    expect(renderToStaticMarkup(createElement(Probe))).toContain("idle");
    expect(fetch).not.toHaveBeenCalled();
    expect(selectedFilterTable(profile(item.source), axes, { c: "0" })).toBeUndefined();
    expect(await decodeFilterAggregation(item.source, axes)).toEqual(raw);
    expect(fetch).toHaveBeenCalledWith(`/ev-live/filter-aggregates/${item.source.rowsAsset!.sha256}.json`,
      expect.objectContaining({ cache: "no-cache", signal: expect.any(AbortSignal) }));
  });
  it("does not share financial constants between rates whose row assets are identical", async () => {
    const item = asset(); fetchBody(item.body);
    const differentRate = { ...item.source, costPerGame: 40, exchange: 1000 / 52 };
    const first = decodeFilterAggregation(item.source, axes);
    expect(decodeFilterAggregation(item.source, axes)).toBe(first);
    const [one, two] = await Promise.all([first, decodeFilterAggregation(differentRate, axes)]);
    expect(one.costPerGame).toBe(30); expect(one.exchange).toBe(20);
    expect(two.costPerGame).toBe(40); expect(two.exchange).toBe(1000 / 52);
    expect(selectedFilterTable(profile(item.source), axes, { c: "0" }, one)?.baseAnchors[0].ev)
      .not.toBe(selectedFilterTable(profile(differentRate), axes, { c: "0" }, two)?.baseAnchors[0].ev);
  });
  it("keeps a verified empty result empty instead of showing the unrestricted anchors", async () => {
    const item = asset({ rows: [] }, 0); fetchBody(item.body);
    const decoded = await decodeFilterAggregation(item.source, axes);
    expect(selectedFilterTable(profile(item.source), axes, { c: "0" }, decoded)?.baseAnchors).toEqual([]);
  });
  it("checks bitmask membership after retrieving an asset", async () => {
    const maskAxes: FilterAxis[] = [{ key: "d", label: "特定日", allLabel: "不問", options: ["1", "3"].map(value => ({ value, label: value })) }];
    const item = asset({ rows: [[1, 3, 2, 200, 600]] }); fetchBody(item.body);
    const source: FilterAggregation = { ...item.source, axisKeys: ["d"], axisMatchModes: ["bitmask"] };
    const decoded = await decodeFilterAggregation(source, maskAxes);
    expect(selectedFilterTable(profile(source), maskAxes, { d: "3" }, decoded)?.hits).toBe(2);
  });
  it("rejects a changed body even when it remains valid JSON", async () => {
    const item = asset(); fetchBody(JSON.stringify({ rows: [] }));
    await expect(decodeFilterAggregation(item.source, axes)).rejects.toThrow(/checksum/);
    expect(selectedFilterTable(profile(item.source), axes, { c: "0" })).toBeUndefined();
  });
  it("lets a missing old asset fail and permits a later retry", async () => {
    const item = asset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response(item.body)));
    await expect(decodeFilterAggregation(item.source, axes)).rejects.toThrow(/unavailable/);
    expect(selectedFilterTable(profile(item.source), axes, { c: "0" })).toBeUndefined();
    await expect(decodeFilterAggregation(item.source, axes)).resolves.toEqual(raw);
  });
  it("does not deliver stale profile or revision data after a new asset is selected", async () => {
    const item = asset(), next = asset({ rows: [[1, 0, 3, 300, 900]] });
    let finishOld!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce(new Response(next.body)));
    const oldReady = vi.fn(), newReady = vi.fn(), failed = vi.fn();
    const cancel = beginAggregationDecode(item.source, axes, oldReady, failed);
    cancel();
    beginAggregationDecode(next.source, axes, newReady, failed);
    await decodeFilterAggregation(next.source, axes);
    finishOld(new Response(item.body));
    await decodeFilterAggregation(item.source, axes); await Promise.resolve();
    expect(oldReady).not.toHaveBeenCalled(); expect(newReady).toHaveBeenCalledOnce(); expect(failed).not.toHaveBeenCalled();
  });
  it("aborts evicted asset fetches and only retains two profile requests", async () => {
    const signals: AbortSignal[] = [];
    const pending: Array<(response: Response) => void> = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, init) => new Promise<Response>((resolve, reject) => {
      signals.push(init.signal); pending.push(resolve);
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const one = asset(), two = asset(), three = asset();
    const first = decodeFilterAggregation(one.source, axes);
    const second = decodeFilterAggregation(two.source, axes);
    const third = decodeFilterAggregation(three.source, axes);
    expect(signals[0].aborted).toBe(true); expect(signals[1].aborted).toBe(false);
    pending[1](new Response(two.body)); pending[2](new Response(three.body));
    expect((await Promise.allSettled([first, second, third])).map(result => result.status))
      .toEqual(["rejected", "fulfilled", "fulfilled"]);
  });
  it.each([
    { rows: [[1, 2, 1, 100, 300]] }, { rows: [[1, 0, 1, -100, 300]] },
    { rowsGzip: gzipSync(JSON.stringify(raw.rows)).toString("base64"), rowCount: 2 },
    { rowsGzip: gzipSync(JSON.stringify([raw.rows[0], raw.rows[0]])).toString("base64"), rowCount: 1 },
    { rows: raw.rows, events: [] }
  ])("rejects a hash-valid asset with invalid rows or envelope %j", async payload => {
    const item = asset(payload); fetchBody(item.body);
    await expect(decodeFilterAggregation(item.source, axes)).rejects.toThrow(/aggregation/);
  });
});

describe("asset envelope contract", () => {
  it("builds only a fixed internal path and keeps a base path", () => {
    const descriptor = asset().source.rowsAsset!;
    expect(aggregationAssetPath(descriptor, "/ev-live")).toBe(`/ev-live/filter-aggregates/${descriptor.sha256}.json`);
  });
  it.each([null, {}, { sha256: "../outside", rowCount: 1 }, { sha256: "a".repeat(64), rowCount: -1 },
    { sha256: "a".repeat(64), rowCount: 1.5 }, { sha256: "A".repeat(64), rowCount: 1 },
    { sha256: "a".repeat(64), rowCount: 1, url: "https://other.example/" }
  ])("rejects invalid references %j", descriptor => {
    expect(() => validateAggregationRowsAsset(descriptor)).toThrow(/aggregation asset/);
  });
  it.each([{ rows: raw.rows }, { rowsGzip: "AAAA", rowCount: 1 }, { rowCount: 1 }])("rejects asset and inline mixtures %j", patch => {
    expect(() => validateMachine(machine({ ...asset().source, ...patch } as FilterAggregation))).toThrow(/aggregation/);
  });
  it.each([{ rows: [], rowCount: 0 }, { rowsGzip: "bad", rowCount: 1 }, { rowsGzip: "AAAA", rowCount: -1 },
    { rows: raw.rows, schema: "extra" }, []
  ])("rejects unsupported asset body fields %j", value => {
    expect(() => validateAggregationAssetPayload(value, 1)).toThrow(/aggregation asset/);
  });
});
