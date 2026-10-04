import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvFilter } from "../components/ev/EvFilter";
import { FilterMultiSelect } from "../components/ui/Controls";
import type { FilterAxis } from "../lib/ev/types";

const axes = [
  { key: "c", label: "CZ回数", allLabel: "不問", options: [{ value: "0", label: "0回" }, { value: "1", label: "1回" }] }
] as unknown as FilterAxis[];

describe("絞り込みで帯の高さが変わらない", () => {
  it("件数と解除の行は未選択でも場所を取り、見えなくするだけ", () => {
    const idle = renderToStaticMarkup(createElement(EvFilter, { axes, values: {}, onChange: () => {}, hits: 0 }));
    const picked = renderToStaticMarkup(createElement(EvFilter, { axes, values: { c: "0" }, onChange: () => {}, hits: 4 }));
    expect(idle).toContain("解除");
    expect(idle).toContain("invisible");
    expect(picked).toContain("4件");
    expect(picked).not.toContain("invisible");
  });

  it("複数選択の一覧は閉じている間、帯の中に何も描かない", () => {
    const html = renderToStaticMarkup(createElement(FilterMultiSelect, {
      label: "CZ回数", allLabel: "不問", options: ["0", "1"], values: [], onChange: () => {}, fmt: (value: string) => value
    }));
    expect(html).not.toContain("checkbox");
    expect(html).not.toContain("<details");
    expect(html).toContain('aria-expanded="false"');
  });
});
