import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { packRows, unpackRows } from "../lib/ev/rows-pack-core.mjs";
import { clearAggregationDecodeCache, decodeFilterAggregation } from "../lib/ev/aggregation-decode";
import { validateMachine } from "../lib/ev/validate";
import { externalizeMachineAggregations } from "../lib/filter-aggregate-assets.mjs";
import type { FilterAggregation, FilterAxis } from "../lib/ev/types";
// @ts-expect-error build script intentionally uses the Node ESM runtime
import { packAggregateAssetBody } from "../lib/packed-aggregate-assets.mjs";
// @ts-expect-error build script intentionally uses the Node ESM runtime
import { exportFilterAggregates } from "../scripts/export-filter-aggregates.mjs";

const axes: FilterAxis[] = [{ key: "h", label: "前回", allLabel: "不問",
  options: [0, 1, 2].map(value => ({ value: String(value), label: String(value) })) }];

/** 実データと同じ形：当たり1件が開始Gごとに1行、通常G（と総G）だけが減る。小数・n>1・途中で消える行も混ぜる。 */
function sampleRows(sessions: number, totalPlay = false): number[][] {
  const starts = [0, 10, 20, 30, 72, 80, 100, 150];
  const rows: number[][] = [];
  for (const start of starts) {
    for (let s = 0; s < sessions; s += 1) {
      const hit = 40 + ((s * 37) % 400) + (s % 3 === 0 ? 0.2 : 0), n = s % 17 === 0 ? 2 : 1;
      if (hit <= start) continue;
      const option = start >= 72 && s % 5 === 0 ? 2 : s % 3; // 開始Gで軸の値が変わる当たり
      const normal = (hit - start) * n, payout = (s * 13) % 900 - 50;
      rows.push(totalPlay ? [start, option, n, normal, payout, normal + 120.5 * n] : [start, option, n, normal, payout]);
    }
  }
  // 行の検査（同じ 開始G・軸・通常G/n の行は1つだけ）に合わせて重なりを落とす
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = JSON.stringify([row[0], row[1], row[3] / row[2]]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
const same = (a: number[][], b: number[][]) => a.length === b.length &&
  a.every((row, i) => row.length === b[i].length && row.every((value, c) => Object.is(value, b[i][c])));
const unpackBody = (body: string, rowCount: number) =>
  unpackRows(JSON.parse(gunzipSync(Buffer.from(JSON.parse(body).rowsPacked, "base64")).toString("utf8")), rowCount);

describe("packed aggregate rows", () => {
  it.each([false, true])("restores the same rows, order and exact numbers (totalPlay=%s)", totalPlay => {
    const rows = sampleRows(700, totalPlay);
    const packed = packRows(rows, totalPlay ? [3, 5] : [3], 2)!;
    expect(packed).not.toBeNull();
    expect(packed.first.length).toBeLessThan(rows.length / 3);
    expect(same(unpackRows(JSON.parse(JSON.stringify(packed)), rows.length), rows)).toBe(true);
  });
  it("keeps rows that do not follow the pattern as their own groups", () => {
    const rows = [[0, 0, 1, 100.1, 5], [0, 1, 1, 7, 9], [10, 0, 1, 90.3, 5], [10, 1, 1, 6, 9], [20, 2, 3, 1, 1]];
    const packed = packRows(rows, [3], 2)!;
    expect(same(unpackRows(packed, rows.length), rows)).toBe(true);
  });
  it("refuses rows that are not grouped by start, and malformed packed input", () => {
    expect(packRows([[10, 0, 1, 5, 5], [0, 0, 1, 15, 5], [10, 1, 1, 5, 5]], [3], 2)).toBeNull();
    const rows = sampleRows(50), packed = packRows(rows, [3], 2)!;
    expect(() => unpackRows(packed, rows.length + 1)).toThrow(/row count/);
    expect(() => unpackRows({ ...packed, v: 2 }, rows.length)).toThrow(/version/);
    expect(() => unpackRows({ ...packed, count: packed.count.map(() => 1e9) }, rows.length)).toThrow(/group range/);
    expect(() => unpackRows({ ...packed, columns: packed.columns.slice(1) }, rows.length)).toThrow(/columns/);
    expect(() => unpackRows({ ...packed, linear: [2] }, rows.length)).toThrow(/linear/);
  });
});

describe("packed aggregate assets", () => {
  const rows = sampleRows(700);
  const layout = { axisCount: 1, totalPlayGames: false };
  const aggregation = (payload: object): FilterAggregation => ({
    schema: "evlive-filter-aggregates/v2", axisKeys: ["h"], costPerGame: 30, exchange: 20, medalsPerGame: 1.5,
    junzou: 4, bet: 3, investmentMinimum: "total", roundingEpsilon: 1e-8, ...payload } as FilterAggregation);
  const original = JSON.stringify({ rowsGzip: gzipSync(JSON.stringify(rows)).toString("base64"), rowCount: rows.length });
  const sha256 = createHash("sha256").update(original).digest("hex");
  const serve = async (body: string, reference = { sha256, rowCount: rows.length }) => {
    clearAggregationDecodeCache();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
    return decodeFilterAggregation(aggregation({ rowsAsset: reference }), axes);
  };
  beforeEach(clearAggregationDecodeCache);
  afterEach(() => { vi.unstubAllGlobals(); });

  it("packs large gzip payloads only, and never plain or small ones", () => {
    const body = packAggregateAssetBody(original, layout);
    expect(body.length).toBeLessThan(original.length / 2);
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(["rowCount", "rowsPacked"]);
    expect(same(unpackBody(body, rows.length), rows)).toBe(true);
    const plain = JSON.stringify({ rows });
    expect(packAggregateAssetBody(plain, layout)).toBe(plain);
    const small = JSON.stringify({ rowsGzip: gzipSync(JSON.stringify(rows.slice(0, 20))).toString("base64"), rowCount: 20 });
    expect(packAggregateAssetBody(small, layout)).toBe(small);
    // 列の指定が実データと合わなくても、出てくる中身は必ず元と同じ行に戻る
    const wrong = packAggregateAssetBody(original, { axisCount: 0, totalPlayGames: false });
    if (JSON.parse(wrong).rowsPacked) expect(same(unpackBody(wrong, rows.length), rows)).toBe(true);
    else expect(wrong).toBe(original);
  });

  it("the screen decodes a packed asset to exactly the rows of the original asset", async () => {
    const fromOriginal = await serve(original);
    const fromPacked = await serve(packAggregateAssetBody(original, layout));
    expect(same(fromOriginal.rows, rows)).toBe(true);
    expect(same(fromPacked.rows, rows)).toBe(true);
    expect(fromPacked).toEqual(fromOriginal);
  });

  it("still rejects a wrong body, a wrong row count and packed rows that break the row contract", async () => {
    await expect(serve(original.replace("rowCount", "rowCount "))).rejects.toThrow(/checksum/);
    await expect(serve("not json")).rejects.toThrow(/checksum/);
    const packedBody = packAggregateAssetBody(original, layout);
    await expect(serve(packedBody, { sha256, rowCount: rows.length + 1 })).rejects.toThrow(/packed envelope/);
    const bad = rows.map(row => [...row]);
    bad[5][1] = 99;
    const badBody = JSON.stringify({ rowsPacked: gzipSync(JSON.stringify(packRows(bad, [3], 2))).toString("base64"), rowCount: bad.length });
    await expect(serve(badBody)).rejects.toThrow(/option index/);
  });

  it("the exporter writes the packed body under the unchanged reference name", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evlive-aggregates-"));
    try {
      const source = path.join(root, "source"), output = path.join(root, "output");
      await fs.mkdir(source);
      const machine = validateMachine(structuredClone(fixture));
      machine.profiles[0].evFilters = { axes, tables: {}, aggregation: aggregation(JSON.parse(original)) };
      await fs.writeFile(path.join(source, machine.id + ".json"), JSON.stringify(machine));
      const names: string[] = [];
      externalizeMachineAggregations(machine, (hash: string) => names.push(hash + ".json"));
      await exportFilterAggregates(source, output);
      expect(names).toEqual([sha256 + ".json"]);
      expect(await fs.readdir(output)).toEqual(names);
      const written = await fs.readFile(path.join(output, names[0]), "utf8");
      expect(Object.keys(JSON.parse(written)).sort()).toEqual(["rowCount", "rowsPacked"]);
      expect(same(unpackBody(written, rows.length), rows)).toBe(true);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});
