import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { aggregateFilterTable } from "../lib/ev/filter-aggregation";
import { selectedFilterAggregation, selectedFilterTable } from "../lib/ev/profiles";
import { decodeFilterAggregation, clearAggregationDecodeCache } from "../lib/ev/aggregation-decode";
import { validateMachine } from "../lib/ev/validate";
import { externalizeMachineAggregations } from "../lib/filter-aggregate-assets.mjs";
import { inlineSourceAggregations } from "../lib/source-aggregations.mjs";
import { exportFilterAggregates } from "../scripts/export-filter-aggregates.mjs";
import type { DecodedFilterAggregation, FilterAggregation, FilterAxis, Profile } from "../lib/ev/types";

const axes: FilterAxis[] = [{ key: "n", label: "前回連チャン数", allLabel: "不問",
  options: [{ value: "2", label: "2連以上" }, { value: "3", label: "3連以上" }] }];
const band: DecodedFilterAggregation = { schema: "evlive-filter-aggregates/v2", axisKeys: [],
  costPerGame: 1000 / 46, exchange: 1000 / 52, medalsPerGame: 1, junzou: 4, bet: 3,
  investmentMinimum: "total", roundingEpsilon: 1e-8,
  rows: [[0, 1, 100, 500], [10, 1, 90, 500]] };
// A global top includes a different opportunity than this band's shorter top.
const common: DecodedFilterAggregation = { ...band, axisKeys: ["n"], rows: [
  [0, 0, 1, 100, 500], [0, 0, 1, 50, 0], [10, 0, 1, 90, 500], [10, 0, 1, 40, 0],
] };
const fixed = { ...aggregateFilterTable(band, [], {}, 0), units: 1, firstHitRate: 100,
  baseAnchors: aggregateFilterTable(band, [], {}, 0).baseAnchors.map(row => ({ ...row, playG: Math.round(row.playG!) })) };
const profile: Profile = { key: "heaven_4652", label: "天国・46/52", ceiling: "100G", activeAxes: [], zones: [],
  gRange: { start: 0, end: 10, step: 10 }, baseAnchors: common.rows.length ? aggregateFilterTable(common, axes, {}, 0).baseAnchors : [],
  evFilters: { axes, tables: { n2: fixed, n3: fixed }, aggregation: common, tableAggregations: { n2: band } } };
const machine = () => ({ ...structuredClone(fixture), setting1Correction: undefined, profiles: [structuredClone(profile)] });
const compressed = (): FilterAggregation => {
  const { rows, ...parameters } = band;
  return { ...parameters, rowsGzip: gzipSync(JSON.stringify(rows)).toString("base64"), rowCount: rows.length };
};

afterEach(() => { clearAggregationDecodeCache(); vi.unstubAllGlobals(); });

describe("independent heaven investment distributions", () => {
  it("uses the selected band's eligibility instead of filtering the unrestricted cohort", () => {
    expect(selectedFilterTable(profile, axes, { n: "2" }, undefined, 0)).toBe(fixed);
    expect(selectedFilterAggregation(profile, axes, { n: "2" })).toBe(band);
    const actual = selectedFilterTable(profile, axes, { n: "2" }, undefined, 100)!;
    const expected = aggregateFilterTable(band, [], {}, 0, 100);
    const incorrect = aggregateFilterTable(common, axes, { n: "2" }, 0, 100);
    expect(actual.baseAnchors.map(row => row.ev)).toEqual(expected.baseAnchors.map(row => row.ev));
    expect(actual.baseAnchors.map(row => row.ev)).not.toEqual(incorrect.baseAnchors.map(row => row.ev));
    expect(actual).toEqual({ ...fixed, baseAnchors: fixed.baseAnchors.map((row, i) => ({ ...row, ev: expected.baseAnchors[i].ev })) });
    expect(selectedFilterAggregation(profile, axes, {})).toBe(common);
  });

  it("retains a legacy band at zero holdings and refuses a missing distribution at positive holdings", () => {
    expect(selectedFilterTable(profile, axes, { n: "3" }, undefined, 0)).toBe(fixed);
    expect(selectedFilterAggregation(profile, axes, { n: "3" })).toBeUndefined();
    expect(selectedFilterTable(profile, axes, { n: "3" }, undefined, 100)).toBeUndefined();
    expect(selectedFilterTable(profile, axes, { n: "2|3" }, undefined, 100)).toBeUndefined();
  });

  it("validates only axis-free v2 distributions attached to an existing heaven band", () => {
    expect(validateMachine(machine()).profiles[0].evFilters?.tableAggregations?.n2).toEqual(band);
    for (const alter of [
      (value: ReturnType<typeof machine>) => { value.profiles[0].key = "normal_4652"; },
      (value: ReturnType<typeof machine>) => { value.profiles[0].evFilters!.tableAggregations!.n9 = band; },
      (value: ReturnType<typeof machine>) => { value.profiles[0].evFilters!.tableAggregations!.n2 = common; },
      (value: ReturnType<typeof machine>) => { value.profiles[0].evFilters!.tableAggregations!.n2 = { ...band, schema: "evlive-filter-aggregates/v1" }; },
      (value: ReturnType<typeof machine>) => { value.profiles[0].evFilters!.tableAggregations!.n2 = { ...band, rows: [[0, 0, 1, 100, 500]] }; },
    ]) {
      const value = machine(); alter(value);
      expect(() => validateMachine(value)).toThrow(/tableAggregation|aggregation/);
    }
  });

  it("lazily decodes the selected independent band with no axes", async () => {
    const source = compressed();
    const value = { ...profile, evFilters: { ...profile.evFilters!, tableAggregations: { n2: source } } };
    expect(selectedFilterTable(value, axes, { n: "2" }, undefined, 100)).toBeUndefined();
    const decoded = await decodeFilterAggregation(source, []);
    expect(selectedFilterTable(value, axes, { n: "2" }, decoded, 100))
      .toEqual(selectedFilterTable(profile, axes, { n: "2" }, undefined, 100));
  });

  it("externalizes and authenticates band assets without placing their rows in live HTML payloads", async () => {
    const assets = new Map<string, string>();
    const value = machine(); value.profiles[0].evFilters!.tableAggregations!.n2 = compressed();
    const external = externalizeMachineAggregations(value, (hash, body) => assets.set(hash, body));
    const source = external.profiles[0].evFilters!.tableAggregations!.n2;
    expect(source.rows).toBeUndefined(); expect(source.rowsGzip).toBeUndefined();
    expect(source.rowsAsset).toBeDefined();
    expect(validateMachine(external)).toEqual(external);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(assets.get(source.rowsAsset!.sha256)!)));
    expect(await decodeFilterAggregation(source, [])).toEqual(band);
  });

  it("hydrates and exports corrected and measured band assets through the normal source path", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "evot-heaven-"));
    const machines = path.join(root, "machines"), sourceAssets = path.join(root, "filter-aggregates");
    mkdirSync(machines); mkdirSync(sourceAssets);
    const value = machine();
    const corrected = structuredClone(profile);
    corrected.evFilters!.tableAggregations!.n2 = { ...band, rows: band.rows.map(row => row.map((n, i) => i === 3 ? n * .8 : n)) };
    const full = { ...value, setting1Correction: { schemaVersion: 1, sourceHallId: "mixed", targetRtp: .97,
      payoutScale: .8, method: "payout-scale", profiles: [corrected] } };
    const assets = new Map<string, string>();
    const external = externalizeMachineAggregations(full, (hash, body) => assets.set(hash, body));
    for (const [hash, body] of assets) writeFileSync(path.join(sourceAssets, `${hash}.json`), body, "utf8");
    expect(inlineSourceAggregations(external, sourceAssets)).toEqual(full);
    writeFileSync(path.join(machines, `${value.id}.json`), JSON.stringify(external), "utf8");
    const result = await exportFilterAggregates(machines, path.join(root, "public"));
    expect(result.assets).toBe(assets.size);
  });
});
