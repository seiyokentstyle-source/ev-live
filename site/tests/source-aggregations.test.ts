import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inlineSourceAggregations, sourceAggregatesDir } from "../lib/source-aggregations.mjs";
import { externalizeMachineAggregations } from "../lib/filter-aggregate-assets.mjs";
import { exportFilterAggregates } from "../scripts/export-filter-aggregates.mjs";

const rows = [[1, 0, 2, 100, 300], [10, 1, 1, 50, 120]];
const aggregation = { schema: "evlive-filter-aggregates/v1", axisKeys: ["c"], costPerGame: 30, exchange: 20,
  medalsPerGame: 1.5, junzou: 3, bet: 3, investmentMinimum: "mean", roundingEpsilon: 1e-8 };
const machineWith = (aggregate: object) => ({ id: "m1", profiles: [{ key: "game_ceiling_4652",
  evFilters: { axes: [{ key: "c", label: "c", allLabel: "不問", options: [{ value: "0", label: "0" }, { value: "1", label: "1" }] }],
    tables: {}, aggregation: aggregate } }] });

function workspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), "evlive-source-agg-"));
  const machines = path.join(root, "machines"), assets = path.join(root, "filter-aggregates");
  mkdirSync(machines); mkdirSync(assets);
  const body = JSON.stringify({ rows });
  const sha256 = createHash("sha256").update(body, "utf8").digest("hex");
  writeFileSync(path.join(assets, `${sha256}.json`), body, "utf8");
  return { root, machines, assets, sha256 };
}

describe("source aggregate files written beside machine JSON", () => {
  it("restores the exact inline rows and leaves inline machines unchanged", () => {
    const { machines, sha256 } = workspace();
    const dir = sourceAggregatesDir(machines);
    const restored = inlineSourceAggregations(machineWith({ ...aggregation, rowsAsset: { sha256, rowCount: 2 } }), dir);
    expect(restored.profiles[0].evFilters.aggregation).toEqual({ ...aggregation, rows });
    const inline = machineWith({ ...aggregation, rows });
    expect(inlineSourceAggregations(inline, dir)).toEqual(inline);
  });

  it("keeps only the site's own reference for profiles whose rows are not needed at build time", () => {
    const { machines, assets } = workspace();
    // The scraper writes Python floats such as 100.0; the site's bytes are JSON.stringify's.
    const body = '{"rows":[[1,0,2,100.0,300.0],[10,1,1,50.0,120.0]]}';
    const sha256 = createHash("sha256").update(body, "utf8").digest("hex");
    writeFileSync(path.join(assets, `${sha256}.json`), body, "utf8");
    const dir = sourceAggregatesDir(machines);
    const source = machineWith({ ...aggregation, rowsAsset: { sha256, rowCount: 2 } });
    const full = externalizeMachineAggregations(inlineSourceAggregations(source, dir));
    const lazy = inlineSourceAggregations(source, dir, { profileKeys: /^cz_ceiling_(4652|5050)$/ });
    expect(JSON.stringify(lazy)).toBe(JSON.stringify(full));
    expect(lazy.profiles[0].evFilters.aggregation.rowsAsset.sha256).not.toBe(sha256);
    const wanted = inlineSourceAggregations(source, dir, { profileKeys: /^game_ceiling_4652$/ });
    expect(wanted.profiles[0].evFilters.aggregation).toEqual({ ...aggregation, rows });
  });

  it("rejects a missing, altered or miscounted file", () => {
    const { machines, assets, sha256 } = workspace();
    const dir = sourceAggregatesDir(machines);
    expect(() => inlineSourceAggregations(machineWith({ ...aggregation, rowsAsset: { sha256, rowCount: 3 } }), dir))
      .toThrow(/row count/);
    expect(() => inlineSourceAggregations(machineWith({ ...aggregation, rowsAsset: { sha256: "0".repeat(64), rowCount: 2 } }), dir))
      .toThrow();
    writeFileSync(path.join(assets, `${sha256}.json`), JSON.stringify({ rows: [[1, 0, 9, 9, 9], rows[1]] }), "utf8");
    expect(() => inlineSourceAggregations(machineWith({ ...aggregation, rowsAsset: { sha256, rowCount: 2 } }), dir))
      .toThrow(/content hash/);
  });

  it("lets the build exporter publish rows that the scraper stored as files", async () => {
    const { root, machines, sha256 } = workspace();
    writeFileSync(path.join(machines, "m1.json"),
      JSON.stringify(machineWith({ ...aggregation, rowsAsset: { sha256, rowCount: 2 } })), "utf8");
    const output = path.join(root, "public");
    const result = await exportFilterAggregates(machines, output);
    expect(result.assets).toBe(1);
    const [file] = readdirSync(output);
    expect(JSON.parse(readFileSync(path.join(output, file), "utf8"))).toEqual({ rows });
  });
});
