import { describe, expect, it } from "vitest";
import { aggregateFilterTable } from "../lib/ev/filter-aggregation";
import { onlyLowSetting, withoutLowSetting } from "../lib/ev/low-setting";
import type { OfficialCalibration } from "../lib/ev/official-calibration";
import { validateOfficialCalibration } from "../lib/ev/official-calibration";
import type { FilterAggregation, FilterAxis, Machine, Profile, Setting1Correction } from "../lib/ev/types";
import { validateMachine } from "../lib/ev/validate";

// Synthetic declarations only: no collected machine file or snapshot is read.
const targets = [
  ["reset_0_600", 100, "gte", "reset_5050", 0],
  ["normal_300_850", 100.3, "eq", "after_other_5050", 300],
  ["normal_400_850", 106.1, "eq", "after_other_5050", 400],
  ["after_upper_0_850", 105.1, "eq", "after_upper_5050", 0],
  ["zone_50_100", 105.7, "eq", "zone_50_100_5050", 50],
  ["zone_150_250", 101, "eq", "zone_150_250_5050", 150],
  ["overall_0", 97.9, "eq", null, 0],
] as const;

function correctedProfiles(): Profile[] {
  const profiles = new Map<string, Profile>();
  for (const [, rtp, , key, g] of targets) {
    if (!key) continue;
    if (!profiles.has(key)) profiles.set(key, {
      key, label: `${key}（推定）`, ceiling: "カウンターGによる推定",
      gRange: { start: g, end: g, step: 10 }, activeAxes: [], zones: [], baseAnchors: [],
    });
    profiles.get(key)!.baseAnchors.push({ g, ev: rtp >= 100 ? 100 : -100, rtp, n: 30, inv: 100, playG: 100 });
    profiles.get(key)!.gRange.end = g;
  }
  for (const profile of profiles.values()) {
    if (profile.baseAnchors.length === 1) {
      const anchor = profile.baseAnchors[0];
      profile.baseAnchors.push({ ...anchor, g: anchor.g + 10 });
      profile.gRange.end += 10;
    }
  }
  return [...profiles.values()];
}

function correction(): Setting1Correction {
  const calibration: OfficialCalibration = {
    schemaVersion: 1, status: "matched", method: "session-payout-linear-v1",
    source: "user-provided-reference", assumptions: ["提供画像を使用。一次出典・詳細条件は未確認"],
    sessionCount: 240, payoutScale: .9,
    checks: targets.map(([key, rtp, op]) => ({ key, targetRtpPercent: rtp,
      actualRtpPercent: rtp, displayRtpPercent: rtp, op, status: "matched",
      source: key === "overall_0" ? "published-setting1-rtp" : "user-provided-reference",
      samples: 30, normalGames: 3000 })),
    unsupportedReferences: [{ key: "upper_cz_failed_0_250", targetRtpPercent: 103.9,
      status: "held", reason: "cohort_unobservable" }],
  };
  return { schemaVersion: 1, sourceHallId: "mixed", targetRtp: .979, payoutScale: .9,
    method: "official-calibration", calibration, profiles: correctedProfiles() };
}

function machine(): Machine {
  const adjusted = correction();
  const profiles = structuredClone(adjusted.profiles);
  for (const profile of profiles) {
    profile.baseAnchors = profile.baseAnchors.map(anchor => ({ ...anchor, ev: -900, rtp: 96 }));
  }
  return {
    id: "lycoris", name: "Lリコリス・リコイル", manufacturer: "Sammy", aliases: [],
    thumb: null, available: true, releaseDate: "2026-09-01", lastUpdated: "2026-10-14",
    meta: { samples: "240", source: "synthetic" }, profiles,
    axes: [{ key: "rate", label: "レート", type: "select", pivotable: false, default: "tab",
      options: [{ value: "tab", label: "上のタブで切替" }] }], modifiers: { rate: { tab: 0 } },
    creditValue: { tab: 20 }, economics: { medalsPerGame: 50 / 31.8, gamesPerHour: 800 },
    calcSpec: { items: [{ k: "設定1想定の補正", v: "旧説明" },
      { k: "前回連チャン数の絞り込み", v: "初当りエピソードを除く推定本数。駆け抜け0回" }] },
    setting1Correction: adjusted,
  };
}

describe("Lycoris supplied-reference calibration contract", () => {
  it("accepts all seven constraints and their inspectable public anchors", () => {
    expect(() => validateOfficialCalibration("lycoris", correction())).not.toThrow();
    expect(validateMachine(machine()).setting1Correction?.method).toBe("official-calibration");
  });

  const mutations: Array<[string, (value: Setting1Correction) => void]> = [
    ["wrong source hall", value => { value.sourceHallId = "shinjuku"; }],
    ["wrong whole-machine target", value => { value.targetRtp = .98; }],
    ["held report", value => { value.calibration!.status = "held"; }],
    ["summary scale mismatch", value => { value.calibration!.payoutScale = .8; }],
    ["missing target", value => { value.calibration!.checks.pop(); }],
    ["duplicate target", value => { value.calibration!.checks[1] = value.calibration!.checks[0]; }],
    ["missing global target", value => { value.calibration!.checks[6].key = "unknown"; }],
    ["wrong global provenance", value => { value.calibration!.checks[6].source = "user-provided-reference"; }],
    ["claimed verified primary provenance", value => { value.calibration!.checks[1].source = "official-site-verified"; }],
    ["reset below minimum", value => { value.calibration!.checks[0].actualRtpPercent = 99.9; }],
    ["changed comparison direction", value => { value.calibration!.checks[0].op = "eq"; }],
    ["nonfinite rate", value => { value.calibration!.checks[1].actualRtpPercent = NaN; }],
    ["wrong displayed rounding", value => { value.calibration!.checks[1].displayRtpPercent = 100.4; }],
    ["no samples", value => { value.calibration!.checks[1].samples = 0; }],
    ["negative normal cost", value => { value.calibration!.checks[1].normalGames = -1; }],
    ["missing public start", value => { value.profiles[1].baseAnchors[0].g = 301; }],
    ["wrong public rate", value => { value.profiles[1].baseAnchors[0].rtp = 100.4; }],
    ["fabricated upper-CZ cohort", value => { value.calibration!.unsupportedReferences = []; }],
  ];
  it.each(mutations)("rejects %s", (_, mutate) => {
    const value = correction();
    mutate(value);
    expect(() => validateOfficialCalibration("lycoris", value)).toThrow(/official calibration/);
  });

  it("permits reset above 100 only when the published anchor matches its reported value", () => {
    const value = correction();
    Object.assign(value.calibration!.checks[0], { actualRtpPercent: 101.25, displayRtpPercent: 101.3 });
    expect(() => validateOfficialCalibration("lycoris", value)).toThrow(/anchor mismatch/);
    value.profiles[0].baseAnchors[0].rtp = 101.3;
    expect(() => validateOfficialCalibration("lycoris", value)).not.toThrow();
    expect(() => validateOfficialCalibration("another-machine", value)).toThrow(/identity/);
  });
});

describe("calibrated and uncorrected mixed selection", () => {
  it("uses precomputed calibrated profiles and preserves the raw estimates", () => {
    const input = machine();
    const before = structuredClone(input);
    const adjusted = onlyLowSetting(input)!;
    expect(adjusted.profiles).toEqual(input.setting1Correction!.profiles);
    expect(adjusted.setting1Correction).toBeUndefined();
    const notes = adjusted.calcSpec!.items.map(item => item.v).join("\n");
    expect(notes).toContain("全体97.9%");
    expect(notes).toContain("合わせ直すことはしません");
    expect(notes).toContain("一次出典・詳細条件は未確認");
    expect(notes).not.toContain("90.00%");
    expect(withoutLowSetting(input)!.profiles).toEqual(input.profiles);
    expect(input).toEqual(before);
  });

  it("holds corrected mixed even if a raw theoretical marker could otherwise supply a fallback", () => {
    const input = machine();
    const hold = structuredClone(input.setting1Correction!.calibration!);
    hold.status = "held";
    for (const check of hold.checks) check.status = "held";
    input.officialCalibrationHold = hold;
    expect(() => validateMachine(input)).toThrow(/hold cannot coexist/);
    delete input.setting1Correction;
    input.calcSpec!.items.push({ k: "★獲得は実測ではない", v: "fallback marker" });
    expect(onlyLowSetting(input)).toBeNull();
    expect(validateMachine(input).officialCalibrationHold?.status).toBe("held");
    input.calcSpec!.items.pop();
    expect(withoutLowSetting(input)!.profiles).toEqual(input.profiles);
  });

  it("keeps calibrated per-count payouts fixed and excludes unknown counts only after selecting a count", () => {
    const axes: FilterAxis[] = [{ key: "n", label: "前回連チャン数（推定・初当りエピソード除く）",
      allLabel: "不問", options: [{ value: "0", label: "0回（駆け抜け）" },
        { value: "2", label: "2回" }, { value: "10", label: "10回以上" }] }];
    const aggregation: FilterAggregation = {
      schema: "evlive-filter-aggregates/v2", axisKeys: ["n"],
      costPerGame: 20 * 50 / 31.8, exchange: 20, medalsPerGame: 50 / 31.8,
      junzou: 8.4, bet: 3, investmentMinimum: "mean", roundingEpsilon: 1e-8,
      rows: [[50, -1, 1, 50, 75], [50, 0, 1, 50, 100], [50, 1, 2, 100, 400],
        [50, 2, 1, 50, 400]],
    };
    const all = aggregateFilterTable(aggregation, axes, {}, 50);
    const zero = aggregateFilterTable(aggregation, axes, { n: "0" }, 50);
    const two = aggregateFilterTable(aggregation, axes, { n: "2" }, 50);
    expect(all.baseAnchors[0].n).toBe(5);
    expect(zero.baseAnchors[0].n).toBe(1);
    expect(two.baseAnchors[0].n).toBe(2);
    expect(zero.totalPayout).toBe(100);
    expect(two.totalPayout).toBe(400);
    expect(two.baseAnchors[0].rtp).not.toBe(zero.baseAnchors[0].rtp);
    expect(aggregateFilterTable(aggregation, axes, { n: "0|2|10" }, 50).baseAnchors[0].n).toBe(4);
  });
});
