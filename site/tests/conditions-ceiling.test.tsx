import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConditionsBar } from "../components/ev/ConditionsBar";
import type { Machine } from "../lib/ev/types";

const machine: Machine = {
  id: "m020bda5f", name: "Synthetic bonus/ST machine", manufacturer: "test", aliases: [], thumb: null,
  available: true, releaseDate: "2026-01-01", lastUpdated: "2026-10-08",
  meta: { samples: "100", source: "synthetic" }, profiles: [], axes: [], modifiers: {},
  creditValue: { "46": 1000 / 46, "50": 20 }, economics: { medalsPerGame: 1.5, gamesPerHour: 800 },
  evCalc: { bet: 3, use: 1.5, junzou: 4.2, ceiling: 1009, step: 10 },
  calcSpec: { items: [{ k: "期待値表の実G上限", v: "1009G" }] }
};

describe("selected profile ceiling", () => {
  it("renders 428G instead of the common 1009G calculation cap for a short-ceiling aim", () => {
    const before = structuredClone(machine);
    const html = renderToStaticMarkup(<ConditionsBar machine={machine} mode="ev" rateLabel="46/52" ceilingText="428G／RB当選でやめ" />);
    expect(html).toContain("428G／RB当選でやめ");
    expect(html).not.toContain("1009G");
    expect(machine).toEqual(before);
  });

  it.each([undefined, null, "", "   "])("retains the common cap when no usable selected ceiling is provided: %j", ceilingText => {
    const html = renderToStaticMarkup(<ConditionsBar machine={machine} mode="ev" ceilingText={ceilingText} />);
    expect(html).toContain("1009G");
  });

  it("retains published machine specifications while removing only the duplicate calculation cap", () => {
    const withPublishedSpec = { ...machine, calcSpec: { items: [
      ...machine.calcSpec!.items, { k: "ボーナス間天井", v: "1009G（ST駆け抜け後428G）" }
    ] } };
    const html = renderToStaticMarkup(<ConditionsBar machine={withPublishedSpec} mode="ev" ceilingText="短縮天井428G" />);
    expect(html).toContain("短縮天井428G");
    expect(html.match(/1009G/g)).toHaveLength(1);
  });
});
