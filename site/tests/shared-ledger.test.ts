import { describe, expect, it } from "vitest";
import { validateSharedLedger, type ReferenceComparison } from "../lib/ev/shared-ledger";
import type { Profile, Setting1Correction } from "../lib/ev/types";

const points = [
  ["reset_0_600", 100, "gte", "reset_5050", 0, 104.2],
  ["normal_300_850", 100.3, "eq", "after_other_5050", 300, 105.6],
  ["normal_400_850", 106.1, "eq", "after_other_5050", 400, 112.4],
  ["after_upper_0_850", 105.1, "eq", "after_upper_5050", 0, 110.3],
  ["zone_50_100", 105.7, "eq", "zone_50_100_5050", 50, 80.2],
  ["zone_150_250", 101, "eq", "zone_150_250_5050", 150, 93.4],
  ["overall_0", 97.9, "eq", null, 0, 97.9],
] as const;

function fixture(): Setting1Correction {
  const profiles = new Map<string, Profile>();
  for (const [, , , key, g, actual] of points) {
    if (key === null) continue;
    if (!profiles.has(key)) profiles.set(key, { key, label: key, activeAxes: [],
      ceiling: "推定", gRange: { start: g, end: g, step: 10 }, baseAnchors: [], zones: [],
      evFilters: { axes: [], tables: {}, aggregation: { schema: "evlive-filter-aggregates/v2",
        axisKeys: [], totalPlayGames: true, costPerGame: 20, medalsPerGame: 1,
        exchange: 20, bet: 3, junzou: 8.4, investmentMinimum: "mean", roundingEpsilon: 1e-8, rows: [] } } });
    profiles.get(key)!.baseAnchors.push({ g, n: 100, ev: 0, inv: 100, playG: 160, rtp: actual });
  }
  const report: ReferenceComparison = { schemaVersion: 2, method: "reference-comparison",
    status: "comparison-only", source: "user-provided-reference", conditionVerified: false,
    assumptions: ["Synthetic fixture. Reference conditions unverified."],
    checks: points.map(([key, target, op, , , actual]) => ({ key, targetRtpPercent: target,
      actualRtpPercent: actual, displayRtpPercent: actual, op, status: "compared",
      source: key === "overall_0" ? "published-setting1-rtp" : "user-provided-reference",
      conditionVerified: key === "overall_0", samples: 100, normalGames: 10000, totalPlayGames: 16000 })),
    unsupportedReferences: [{ key: "upper_cz_failed_0_250", targetRtpPercent: 103.9,
      actualRtpPercent: null, status: "unavailable", op: "eq", source: "user-provided-reference",
      conditionVerified: false, reason: "cohort_unobservable" }] };
  return { schemaVersion: 1, sourceHallId: "mixed", targetRtp: .979, payoutScale: .96,
    method: "shared-ledger", referenceComparison: report, profiles: [...profiles.values()] };
}

describe("shared Lycoris accounting and honest reference comparison", () => {
  it("allows real differences from the supplied reference without claiming a match", () => {
    expect(() => validateSharedLedger("lycoris", fixture())).not.toThrow();
  });
  it("rejects a whole-machine equation that does not reconcile", () => {
    const input = fixture();
    input.referenceComparison!.checks.at(-1)!.actualRtpPercent = 97.91;
    expect(() => validateSharedLedger("lycoris", input)).toThrow(/global equation/);
  });
  it("keeps all-state and upper-AT reference cohorts independent of the visible post-AT profiles", () => {
    const input = fixture();
    const postAt = input.profiles.find(p => p.key === "after_other_5050")!;
    postAt.baseAnchors[0].rtp = 101.2;
    postAt.baseAnchors[0].n = 70;
    postAt.baseAnchors[1].rtp = 108.5;
    postAt.baseAnchors[1].n = 60;
    input.profiles = input.profiles.filter(p => p.key !== "after_upper_5050");
    expect(() => validateSharedLedger("lycoris", input)).not.toThrow();
  });
  it("allows independently calculated zone references without adding visible zone profiles", () => {
    const input = fixture();
    input.profiles = input.profiles.filter(p => !p.key.startsWith("zone_"));
    expect(() => validateSharedLedger("lycoris", input)).not.toThrow();
  });
  it.each(["zone_50_100_5050", "zone_150_250_5050"])(
    "does not bind an independent zone comparison to a differently scoped profile: %s", key => {
    const input = fixture();
    input.profiles.find(p => p.key === key)!.baseAnchors[0].rtp += 1;
    expect(() => validateSharedLedger("lycoris", input)).not.toThrow();
  });
  it("rejects a reset reference RTP mismatch for the same published cohort", () => {
    const input = fixture();
    input.profiles.find(p => p.key === "reset_5050")!.baseAnchors[0].rtp += 1;
    expect(() => validateSharedLedger("lycoris", input)).toThrow(/published comparison/);
  });
  it("rejects a reset reference sample count mismatch", () => {
    const input = fixture();
    input.profiles.find(p => p.key === "reset_5050")!.baseAnchors[0].n -= 1;
    expect(() => validateSharedLedger("lycoris", input)).toThrow(/published comparison/);
  });
  it.each(["actualRtpPercent", "displayRtpPercent"] as const)(
    "still rejects non-finite independent reference values: %s", field => {
    for (const key of ["normal_300_850", "zone_50_100", "zone_150_250"]) {
      const input = fixture();
      input.referenceComparison!.checks.find(check => check.key === key)![field] = NaN;
      expect(() => validateSharedLedger("lycoris", input)).toThrow(/comparison values/);
    }
  });
  it("rejects claims that the unobserved reference conditions were verified", () => {
    const input = fixture();
    input.referenceComparison!.checks[4].conditionVerified = true;
    expect(() => validateSharedLedger("lycoris", input)).toThrow(/reference condition/);
  });
  it("requires filter replay to use the same elapsed-game totals", () => {
    const input = fixture();
    delete input.profiles[0].evFilters!.aggregation!.totalPlayGames;
    expect(() => validateSharedLedger("lycoris", input)).toThrow(/shared elapsed/);
  });
});
