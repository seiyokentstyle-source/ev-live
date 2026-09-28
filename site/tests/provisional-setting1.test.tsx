import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { validateMachine } from "../lib/ev/validate";
import { validateProvisionalSetting1, validateMachineProvisionalSetting1 } from "../lib/ev/provisional-setting1";
import { machineSummary } from "../lib/ev/summary";
import { buildLiveCollection, liveIndexEntry } from "../lib/live-data";
import { fetchLiveMachine } from "../lib/live-refresh";
import { MachineDetailClient, LiveMachineClient } from "../app/machines/[id]/MachineDetailClient";
import { ProvisionalSetting1Table } from "../components/ev/ProvisionalSetting1Table";
import { getHall } from "../lib/halls";
import { collectedFixture } from "./fixtures/collection-status";
import { referenceFixture } from "./fixtures/provisional-setting1";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function pendingMachine() {
  const machine = validateMachine(structuredClone(fixture));
  machine.id = "lycoris";
  const collection = collectedFixture(machine.id);
  machine.meta = collection.summary.meta;
  machine.profiles = machine.profiles.map(profile => ({ ...profile, dataPending: true, baseAnchors: [], zones: [], sessions: 0, pendingReason: collection.pendingReason }));
  machine.provisionalSetting1 = referenceFixture("lycoris");
  return machine;
}

describe("public-spec provisional reference", () => {
  it("keeps real observations pending with zero samples and excludes reference tables from summaries", () => {
    const machine = validateMachine(pendingMachine());
    expect(machine.meta.samples).toBe("0");
    expect(machine.profiles.every(profile => profile.dataPending && profile.baseAnchors.length === 0)).toBe(true);
    expect(machineSummary(machine)).not.toHaveProperty("provisionalSetting1");
    expect(validateProvisionalSetting1(referenceFixture("lycoris"))).toEqual(machine.provisionalSetting1);
    expect(machine.provisionalSetting1!.rates.map(rate => rate.key)).toEqual(["46/52", "50/50"]);
  });

  it.each([
    ["history claim", (v: any) => { v.historyBased = true; }],
    ["graph claim", (v: any) => { v.graphCorrected = true; }],
    ["label", (v: any) => { v.label = "実測"; }],
    ["missing assumptions", (v: any) => { v.assumptions = []; }],
    ["source scheme", (v: any) => { v.sources[0].url = "javascript:alert(1)"; }],
    ["source credentials", (v: any) => { v.sources[0].url = "https://name:pass@example.test/"; }],
    ["nonfinite input", (v: any) => { v.publicInputs.firstHitMeanGames = Infinity; }],
    ["mean beyond cap", (v: any) => { v.publicInputs.firstHitMeanGames = 101; }],
    ["changed probability", (v: any) => { v.modelInputs.normalHitProbability *= 2; }],
    ["changed payout", (v: any) => { v.modelInputs.assumedFixedPayout += 1; }],
    ["missing rate", (v: any) => { v.rates.pop(); }],
    ["wrong exchange", (v: any) => { v.rates[0].creditPerMedal = 20; }],
    ["reordered G", (v: any) => { v.rates[0].anchors.reverse(); }],
    ["missing row", (v: any) => { v.rates[0].anchors.pop(); }],
    ["changed EV", (v: any) => { v.rates[0].anchors[0].ev += 10; }],
    ["changed RTP", (v: any) => { v.rates[0].anchors[0].rtp += 2; }],
    ["changed RTP decimal", (v: any) => { v.rates[0].anchors[0].rtp += 0.1; }],
    ["changed time", (v: any) => { v.rates[0].anchors[0].playG += 1; }],
    ["changed investment", (v: any) => { v.rates[0].anchors[0].inv += 1; }],
    ["sample field", (v: any) => { v.rates[0].anchors[0].n = 100; }],
    ["top-level samples", (v: any) => { v.samples = 100; }],
  ])("rejects %s", (_name, mutate) => {
    const value = referenceFixture();
    mutate(value);
    expect(() => validateProvisionalSetting1(value)).toThrow("Invalid provisionalSetting1");
  });

  it("does not admit model numbers as measured machine samples or profiles", () => {
    const machine = pendingMachine();
    machine.meta.samples = "100";
    expect(() => validateMachine(machine)).toThrow("zero EV samples");
    machine.meta.samples = "0";
    machine.profiles[0].dataPending = false;
    expect(() => validateMachine(machine)).toThrow("zero EV samples");
  });

  it("renders both rate choices, explicit assumptions and sources without sample or recommended border claims", () => {
    const reference = referenceFixture();
    const html = renderToStaticMarkup(<ProvisionalSetting1Table data={reference} />);
    for (const text of [reference.label, reference.note, "46/52", "50/50", "外部カウンター値とは対応未確認", "天井直前の参考EVは特に上振れ", ...reference.assumptions]) expect(html).toContain(text);
    expect(html).toContain('href="https://example.test/spec"');
    expect(html).toContain("<table");
    for (const text of ["当店実測", "サンプル", "ボーダー", "text-pos", "円/h"]) expect(html).not.toContain(text);
  });

  it("rejects a model attached to another or an unregistered machine", () => {
    expect(() => validateMachineProvisionalSetting1(referenceFixture("lycoris"), "worlddai")).toThrow("not registered");
    expect(() => validateMachineProvisionalSetting1(referenceFixture("lycoris"), "saoii")).toThrow("not registered");
    expect(() => validateMachineProvisionalSetting1(referenceFixture("lycoris"), "constructor")).toThrow("not registered");
    expect(validateMachineProvisionalSetting1(referenceFixture("worlddai"), "worlddai").rates[1].anchors[0].rtp).toBe(97.8);
  });

  it("shows the reference next to preserved pending status and reason while suppressing old attachments", () => {
    const machine = pendingMachine();
    machine.theoretical = { label: "stale-theory", note: "stale", source: "stale", firstHitG: 100, avgPayout: 99999, ceiling: 1000, gRange: { start: 0, end: 1000, step: 50 }, baseAnchors: [] };
    const html = renderToStaticMarkup(<MachineDetailClient machine={machine} hall={getHall("shinjuku")!} />);
    expect(html).toContain("収集済み 1,200行 / 期待値算出保留");
    expect(html).toContain(machine.profiles[0].pendingReason);
    expect(html).toContain(machine.provisionalSetting1!.label);
    expect(html).toContain("<table");
    for (const text of ["stale-theory", "99999", "全体平均", "設定狙い", "AT獲得", "狙い目"]) expect(html).not.toContain(text);
  });

  it("keeps forced-pending observations separate in live payloads and validates the attachment on refresh", async () => {
    const collection = collectedFixture("lycoris");
    const payload = buildLiveCollection(collection, referenceFixture("lycoris"));
    expect(payload.machine.meta.samples).toBe("0");
    expect(payload.machine).not.toHaveProperty("profiles");
    expect(payload.pending).not.toHaveProperty("provisionalSetting1");
    expect(payload.revision).not.toBe(buildLiveCollection(collection).revision);
    expect(liveIndexEntry("kabuki", payload).summary).not.toHaveProperty("provisionalSetting1");
    const html = renderToStaticMarkup(<LiveMachineClient initial={payload} hall={getHall("kabuki")!} />);
    expect(html).toContain(collection.pendingReason);
    expect(html).toContain(payload.provisionalSetting1!.label);
    expect(html).toContain("収集済み 1,200行 / 期待値算出保留");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => payload } as Response);
    try {
      const entry = liveIndexEntry("kabuki", payload);
      expect(await fetchLiveMachine(entry, new AbortController().signal)).toEqual(payload);
      const corrupt = structuredClone(payload);
      corrupt.provisionalSetting1!.rates[0].anchors[0].ev += 100;
      fetchMock.mockResolvedValue({ ok: true, json: async () => corrupt } as Response);
      await expect(fetchLiveMachine(entry, new AbortController().signal)).rejects.toThrow("model replay");
    } finally { fetchMock.mockRestore(); }
  });
});
