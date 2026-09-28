import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { validateMachine } from "../lib/ev/validate";
import { validateCounterEstimate, validateMachineCounterEstimate } from "../lib/ev/counter-estimate";
import { machineSummary } from "../lib/ev/summary";
import { buildLiveCollection } from "../lib/live-data";
import { LiveMachineClient } from "../app/machines/[id]/MachineDetailClient";
import { CounterEstimateTable } from "../components/ev/CounterEstimateTable";
import { getHall } from "../lib/halls";
import { collectedFixture } from "./fixtures/collection-status";
import { estimateFixture } from "./fixtures/counter-estimate";
import { referenceFixture } from "./fixtures/provisional-setting1";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function pendingMachine() {
  const machine = validateMachine(structuredClone(fixture));
  machine.id = "lycoris";
  const collection = collectedFixture(machine.id);
  machine.meta = collection.summary.meta;
  machine.profiles = machine.profiles.map(profile => ({ ...profile, dataPending: true, baseAnchors: [], zones: [], sessions: 0, pendingReason: collection.pendingReason }));
  machine.counterEstimate = estimateFixture();
  return machine;
}

describe("counter-history estimate", () => {
  it("keeps observations pending and stays out of summaries", () => {
    const machine = validateMachine(pendingMachine());
    expect(machine.meta.samples).toBe("0");
    expect(machineSummary(machine)).not.toHaveProperty("counterEstimate");
    expect(validateCounterEstimate(estimateFixture())).toEqual(machine.counterEstimate);
  });

  it.each([
    ["not history based", (v: any) => { v.historyBased = false; }],
    ["graph claim", (v: any) => { v.graphCorrected = true; }],
    ["label", (v: any) => { v.label = "実測"; }],
    ["missing assumptions", (v: any) => { v.assumptions = []; }],
    ["extra field", (v: any) => { v.samples = 100; }],
    ["summary field", (v: any) => { v.summary.sessions = 9; }],
    ["shares", (v: any) => { v.summary.kakeShare = 0.9; }],
    ["date order", (v: any) => { v.summary.firstDate = "2026-10-01"; }],
    ["group order", (v: any) => { v.groups.reverse(); }],
    ["missing rate", (v: any) => { v.groups[0].rates.pop(); }],
    ["wrong exchange", (v: any) => { v.groups[0].rates[0].creditPerMedal = 20; }],
    ["empty overall", (v: any) => { v.groups[0].rates[0].anchors = []; }],
    ["skipped G", (v: any) => { v.groups[0].rates[0].anchors[1].g = 30; }],
    ["growing samples", (v: any) => { v.groups[0].rates[0].anchors[1].n = 99; }],
    ["fractional EV", (v: any) => { v.groups[0].rates[0].anchors[0].ev = 1.5; }],
    ["nonfinite", (v: any) => { v.groups[0].rates[0].anchors[0].rtp = Infinity; }],
    ["anchor field", (v: any) => { v.groups[0].rates[0].anchors[0].win = 1; }],
  ])("rejects %s", (_name, mutate) => {
    const value = estimateFixture();
    mutate(value);
    expect(() => validateCounterEstimate(value)).toThrow("Invalid counterEstimate");
  });

  it("is registered only for lycoris and never alongside the public reference or measured EV", () => {
    expect(() => validateMachineCounterEstimate(estimateFixture(), "worlddai")).toThrow("not registered");
    const both = pendingMachine();
    both.provisionalSetting1 = referenceFixture("lycoris");
    expect(() => validateMachine(both)).toThrow("both must not be published");
    const measured = pendingMachine();
    measured.meta.samples = "100";
    expect(() => validateMachine(measured)).toThrow("zero EV samples");
  });

  it("renders estimate labels, groups, rates and sample counts", () => {
    const estimate = estimateFixture();
    const html = renderToStaticMarkup(<CounterEstimateTable data={estimate} />);
    for (const text of [estimate.label, estimate.note, "46/52", "50/50", "件数", "推定EV", "前回 駆け抜け", "2026-09-02", ...estimate.assumptions]) {
      expect(html).toContain(text);
    }
  });

  it("travels with a held collection page and changes its revision", () => {
    const collection = collectedFixture("lycoris");
    const plain = buildLiveCollection(collection);
    const withEstimate = buildLiveCollection(collection, undefined, estimateFixture());
    expect(withEstimate.counterEstimate).toEqual(estimateFixture());
    expect(withEstimate.revision).not.toBe(plain.revision);
    expect(() => buildLiveCollection(collectedFixture("worlddai"), undefined, estimateFixture())).toThrow("not registered");
    const html = renderToStaticMarkup(<LiveMachineClient initial={withEstimate} hall={getHall("shinjuku")!} />);
    expect(html).toContain(estimateFixture().label);
  });
});
