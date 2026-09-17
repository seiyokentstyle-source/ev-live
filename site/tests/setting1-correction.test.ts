import { describe, expect, it } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { onlyLowSetting, withoutLowSetting } from "../lib/ev/low-setting";
import type { Machine, Profile } from "../lib/ev/types";
import { validateMachine } from "../lib/ev/validate";

function correctionMachine(method: "payout-scale" | "assumed-payout" = "payout-scale"): Machine {
  const machine = validateMachine(structuredClone(fixture));
  machine.calcSpec = {
    items: [
      { k: "通常時使用枚数", v: "1.53枚/G" },
      { k: "設定1想定の補正", v: "旧部分表の説明" },
      ...(method === "assumed-payout"
        ? [{ k: "★獲得は実測ではない", v: "公表設定1から逆算した定数獲得" }]
        : []),
    ],
  };
  machine.profiles.forEach((profile) => {
    profile.evFilters = {
      tails: [], days: [], cz: ["1"], czAll: "回数不問", czTerm: "CZ",
      axes: [{ key: "c", label: "道中CZ", allLabel: "回数不問", options: [{ value: "1", label: "CZ1回後" }] }],
      tables: {
        c1: {
          baseAnchors: structuredClone(profile.baseAnchors.slice(0, 2)),
          start: profile.gRange.start, end: profile.gRange.end,
          totalPayout: 1000, firstHitRate: 250, units: 1, hits: 2,
        },
      },
    };
  });
  const corrected = structuredClone(machine.profiles);
  for (const profile of corrected) {
    // Deliberately distinct precomputed values: this test is about selecting
    // the generator's tables, not duplicating its correction calculation.
    profile.baseAnchors = profile.baseAnchors.map((anchor) => ({ ...anchor, ev: -2468, rtp: 95.1 }));
    profile.totalPayout = 900;
    profile.evFilters!.tables.c1.baseAnchors = profile.evFilters!.tables.c1.baseAnchors.map(
      (anchor) => ({ ...anchor, ev: -1357, rtp: 96.2 }),
    );
    profile.evFilters!.tables.c1.totalPayout = 850;
  }
  machine.setting1Correction = {
    schemaVersion: 1, sourceHallId: "shinjuku", targetRtp: 0.977,
    payoutScale: method === "assumed-payout" ? 1 : 0.938,
    method, profiles: corrected,
  };
  if (method === "payout-scale") {
    const legacy: Profile = structuredClone(machine.profiles[0]);
    legacy.key = "cz_s1_4652";
    legacy.label = "CZ間（設定1想定・旧部分表）";
    machine.profiles.push(legacy);
  }
  machine.theoretical = {
    label: "設定1想定", note: "旧全体平均表", source: "旧資料", ceiling: 1500,
    firstHitG: 400, avgPayout: 600, specFirstHitG: 476, specRtp: 97.7,
    gRange: structuredClone(machine.profiles[0].gRange),
    baseAnchors: structuredClone(machine.profiles[0].baseAnchors),
  };
  machine.settingAim = { label: "実測設定推定", unit: "%", note: "実測", dates: [], units: [] };
  machine.harakiri = {
    label: "実測ハラキリ", note: "実測", threshold: 400,
    total: { sessions: 1, rush: 1, hits: 1, rate: 100 },
    units: [{ unit: "101", sessions: 1, rush: 1, hits: 1, rate: 100 }],
    byDate: [],
  };
  machine.savedTargets = [];
  return machine;
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) freezeDeep(nested);
    Object.freeze(value);
  }
  return value;
}

describe("complete setting-1 correction selection", () => {
  it("uses all precomputed source-shaped profiles and filters instead of the old partial table", () => {
    const input = correctionMachine();
    const expected = structuredClone(input.setting1Correction!.profiles);
    const output = onlyLowSetting(input)!;

    expect(output.profiles).toEqual(expected);
    expect(output.profiles.map((profile) => profile.key)).toEqual(fixture.profiles.map((profile) => profile.key));
    expect(output.profiles.map((profile) => profile.label)).toEqual(fixture.profiles.map((profile) => profile.label));
    expect(output.profiles[0].baseAnchors[0].ev).toBe(-2468);
    expect(output.profiles[0].evFilters!.tables.c1.baseAnchors[0].ev).toBe(-1357);
    expect(output.profiles[0].evFilters!.axes).toEqual(input.profiles[0].evFilters!.axes);
    expect(onlyLowSetting(input)!.profiles).toEqual(expected);
  });

  it("removes superseded theory, measured side sections, saved targets and the private correction bundle", () => {
    const input = correctionMachine();
    const output = onlyLowSetting(input)!;
    for (const key of ["theoretical", "settingAim", "atPayout", "harakiri", "savedTargets", "setting1Correction"]) {
      expect(input).toHaveProperty(key);
      expect(output).not.toHaveProperty(key);
    }
    expect(() => validateMachine(output)).not.toThrow();
  });

  it("explains the Shinjuku source, correction multiplier and unchanged conditional hit distribution", () => {
    const output = onlyLowSetting(correctionMachine())!;
    const explanations = output.calcSpec!.items.map(({ k, v }) => `${k} ${v}`).join("\n");
    expect(explanations).toContain("新宿");
    expect(explanations).toContain("97.7%");
    expect(explanations).toMatch(/93\.80%|0\.938/);
    expect(explanations).toContain("当選G分布");
    expect(explanations).toContain("母数");
    expect(explanations).not.toContain("旧部分表の説明");
    expect(output.calcSpec!.items).toContainEqual({ k: "通常時使用枚数", v: "1.53枚/G" });
  });

  it("keeps Shinjuku measured values and layout while stripping only estimate material", () => {
    const input = correctionMachine();
    const expected = structuredClone(input.profiles.filter((profile) => !profile.label.includes("設定1想定")));
    const output = withoutLowSetting(input)!;
    expect(output.profiles).toEqual(expected);
    expect(output.profiles[0].baseAnchors[0].ev).toBe(fixture.profiles[0].baseAnchors[0].ev);
    expect(output.setting1Correction).toBeUndefined();
    expect(output.theoretical).toBeUndefined();
    expect(output.atPayout).toEqual(input.atPayout);
    expect(output.settingAim).toEqual(input.settingAim);
  });

  it("does not mutate any input profile, filter, metadata or side section", () => {
    const input = correctionMachine();
    const before = structuredClone(input);
    freezeDeep(input);
    expect(() => onlyLowSetting(input)).not.toThrow();
    expect(() => withoutLowSetting(input)).not.toThrow();
    expect(() => validateMachine(input)).not.toThrow();
    expect(input).toEqual(before);
  });

  it("keeps assumed-payout machines off Shinjuku and uses their supplied mixed tables without extra scaling", () => {
    const input = correctionMachine("assumed-payout");
    expect(withoutLowSetting(input)).toBeNull();
    const output = onlyLowSetting(input)!;
    expect(output.profiles).toEqual(input.setting1Correction!.profiles);
    expect(output.setting1Correction).toBeUndefined();
    expect(output.calcSpec!.items.map((item) => item.v).join(" ")).toContain("追加の獲得補正は行わない");
    expect(() => validateMachine(input)).not.toThrow();
  });

  it("continues legacy partial-table and assumed-payout behavior when a bundle is absent", () => {
    const legacy = correctionMachine();
    delete legacy.setting1Correction;
    expect(onlyLowSetting(legacy)!.profiles.map((profile) => profile.key)).toEqual(["cz_s1_4652"]);
    expect(onlyLowSetting(legacy)!.theoretical).toEqual(legacy.theoretical);
    const assumed = correctionMachine("assumed-payout");
    delete assumed.setting1Correction;
    expect(onlyLowSetting(assumed)).toBe(assumed);
    expect(withoutLowSetting(assumed)).toBeNull();
  });
});

describe("setting-1 correction validation", () => {
  it("accepts a complete bundle without changing either measured or corrected values", () => {
    const input = correctionMachine();
    const expected = structuredClone(input.setting1Correction);
    const output = validateMachine(input);
    expect(output.setting1Correction).toEqual(expected);
    expect(output.profiles).toEqual(input.profiles);
  });

  it.each([
    ["schemaVersion", 0], ["schemaVersion", 2], ["schemaVersion", "1"],
    ["sourceHallId", "akihabara"], ["sourceHallId", "unknown"],
    ["targetRtp", 0], ["targetRtp", -0.1], ["targetRtp", 1], ["targetRtp", 1.1],
    ["targetRtp", Number.NaN], ["targetRtp", Number.POSITIVE_INFINITY], ["targetRtp", "0.977"],
    ["payoutScale", 0], ["payoutScale", -0.1], ["payoutScale", Number.NaN],
    ["payoutScale", Number.POSITIVE_INFINITY], ["payoutScale", "0.938"],
    ["method", "multiply-ev"], ["method", null],
    ["profiles", null], ["profiles", {}],
  ])("rejects invalid correction metadata %s=%j", (field, value) => {
    const input = correctionMachine();
    (input.setting1Correction as unknown as Record<string, unknown>)[field as string] = value;
    expect(() => validateMachine(input)).toThrow();
  });

  it.each([null, [], "invalid", {}])("rejects malformed correction objects %j", (value) => {
    const input = correctionMachine();
    (input as unknown as Record<string, unknown>).setting1Correction = value;
    expect(() => validateMachine(input)).toThrow();
  });

  it.each([
    ["missing profile", (profiles: Profile[]) => { profiles.pop(); }],
    ["unrelated profile", (profiles: Profile[]) => { profiles[0].key = "unrelated_model"; }],
    ["duplicate profile", (profiles: Profile[]) => { profiles[1].key = profiles[0].key; }],
    ["reordered profiles", (profiles: Profile[]) => { profiles.reverse(); }],
    ["empty profiles", (profiles: Profile[]) => { profiles.length = 0; }],
  ] as const)("rejects source profile-key mismatch: %s", (_label, change) => {
    const input = correctionMachine();
    change(input.setting1Correction!.profiles);
    expect(() => validateMachine(input)).toThrow();
  });

  it.each([
    ["unknown axis", (profile: Profile) => { profile.activeAxes = ["missing_axis"]; }],
    ["invalid range step", (profile: Profile) => { profile.gRange.step = 0; }],
    ["too few anchors", (profile: Profile) => { profile.baseAnchors.length = 1; }],
    ["negative samples", (profile: Profile) => { profile.baseAnchors[0].n = -1; }],
    ["nonfinite investment", (profile: Profile) => { profile.baseAnchors[0].inv = Number.POSITIVE_INFINITY; }],
    ["anchor out of range", (profile: Profile) => { profile.baseAnchors[0].g = profile.gRange.start - 1; }],
    ["EV/RTP mismatch", (profile: Profile) => { profile.baseAnchors[0].ev = -100; profile.baseAnchors[0].rtp = 101; }],
  ] as const)("validates corrected profiles as machine profiles: %s", (_label, change) => {
    const input = correctionMachine();
    change(input.setting1Correction!.profiles[0]);
    expect(() => validateMachine(input)).toThrow();
  });

  it("rejects a second multiplier on already assumed payout", () => {
    const input = correctionMachine("assumed-payout");
    input.setting1Correction!.payoutScale = 0.938;
    expect(() => validateMachine(input)).toThrow();
  });

  it.each(["ev", "rtp", "g"] as const)("rejects nonfinite corrected filter-table %s", (field) => {
    const input = correctionMachine();
    input.setting1Correction!.profiles[0].evFilters!.tables.c1.baseAnchors[0][field] = Number.NaN;
    expect(() => validateMachine(input)).toThrow();
  });
});
