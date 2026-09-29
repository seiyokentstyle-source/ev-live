import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { validateMachine } from "../lib/ev/validate";
import { ThroughReleaseTable } from "../components/ev/ThroughReleaseTable";
import type { ThroughRelease } from "../lib/ev/types";

function release(): ThroughRelease {
  return {
    label: "スルー回数別 穢れ解放率",
    note: "架空の集計です。",
    rows: [
      { through: 0, label: "0回", n: 100, hits: 12, rate: 0.12 },
      { through: 1, label: "1回", n: 50, hits: 7, rate: 0.14 },
      { through: 2, label: "2回以上", n: 0, hits: 0, rate: null },
    ],
  };
}

function machine(value: unknown) {
  return { ...structuredClone(fixture), throughRelease: value };
}

describe("through-count release table", () => {
  it("accepts a consistent table and renders rows with counts", () => {
    const data = validateMachine(machine(release()));
    expect(data.throughRelease?.rows).toHaveLength(3);
    const html = renderToStaticMarkup(<ThroughReleaseTable data={release()} />);
    for (const text of ["スルー回数", "解放率", "12.0", "14.0", "2回以上", "架空の集計です。"]) expect(html).toContain(text);
  });

  it.each([
    ["rate mismatch", (v: any) => { v.rows[0].rate = 0.5; }],
    ["hits over n", (v: any) => { v.rows[1].hits = 60; }],
    ["gap in rows", (v: any) => { v.rows[1].through = 3; }],
    ["empty rows", (v: any) => { v.rows = []; }],
    ["rate for empty row", (v: any) => { v.rows[2].rate = 0; }],
  ])("rejects %s", (_name, mutate) => {
    const value = release();
    mutate(value);
    expect(() => validateMachine(machine(value))).toThrow("throughRelease");
  });
});
