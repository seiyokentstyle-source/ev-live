import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RateSelector } from "../components/ev/RateSelector";
import { ConditionsBar } from "../components/ev/ConditionsBar";
import type { Machine } from "../lib/ev/types";

const rates = [{ value: "4652", label: "46/52" }, { value: "5050", label: "50/50（等価）" }];
const noChange = () => {};

function findInput(node: ReactNode): ReactElement | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement(child)) continue;
    if (child.type === "input") return child;
    const found = findInput(child.props.children);
    if (found) return found;
  }
  return undefined;
}

describe("held-medal rate controls", () => {
  it("places the labeled holding input immediately before the two exchange options", () => {
    const html = renderToStaticMarkup(<RateSelector rates={rates} value="4652" onChange={noChange}
      heldMedals={500} onHeldMedalsChange={noChange} />);
    expect(html.indexOf('aria-label="持ちメダル（枚）"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-label="持ちメダル（枚）"')).toBeLessThan(html.indexOf("46/52"));
    expect(html.indexOf("46/52")).toBeLessThan(html.indexOf("50/50（等価）"));
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('value="500"');
  });

  it.each([["", 0], ["0", 0], ["1000", 1000], ["1,000", 1000], ["１，０００", 1000], [" 500 ", 500]])
    ("accepts whole-medal input %j as %s", (text, expected) => {
      const onHeld = vi.fn();
      const input = findInput(RateSelector({ rates, value: "4652", onChange: noChange, onHeldMedalsChange: onHeld }))!;
      input.props.onChange({ target: { value: text } });
      expect(onHeld).toHaveBeenCalledExactlyOnceWith(expected);
    });

  it.each(["-1", "1.5", "1e3", "Infinity", "NaN", "9007199254740992"])
    ("ignores invalid input %j without replacing the selected amount", text => {
      const onHeld = vi.fn();
      const input = findInput(RateSelector({ rates, value: "4652", onChange: noChange, heldMedals: 500, onHeldMedalsChange: onHeld }))!;
      input.props.onChange({ target: { value: text } });
      expect(onHeld).not.toHaveBeenCalled();
      expect(input.props.value).toBe(500);
    });

  it("does not add an input to rate controls that do not opt into held-medal calculation", () => {
    const html = renderToStaticMarkup(<RateSelector rates={rates} value="4652" onChange={noChange} />);
    expect(html).not.toContain("持ちメダル");
    expect(html).toContain("レート");
  });
});

describe("held-medal calculation explanation", () => {
  const machine = { id: "test", meta: { samples: "10", source: "synthetic" },
    economics: { medalsPerGame: 1, gamesPerHour: 800 } } as Machine;

  it("describes the selected holdings as assets valued at exchange, rather than extra winnings", () => {
    const html = renderToStaticMarkup(<ConditionsBar machine={machine} mode="ev" heldMedals={1000} />);
    expect(html).toContain("1,000枚。交換価値で使用し、不足分を現金投資として計算");
    expect(html).toContain("等価交換では期待値は変わりません");
  });

  it("does not describe held-medal EV adjustments in setting or payout modes", () => {
    for (const mode of ["setting", "payout"] as const) {
      const html = renderToStaticMarkup(<ConditionsBar machine={machine} mode={mode} heldMedals={1000} />);
      expect(html).not.toContain("交換価値で使用");
    }
  });
});
