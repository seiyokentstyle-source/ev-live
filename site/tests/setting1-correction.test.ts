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

  it("explains the declared source halls, correction multiplier and unchanged conditional hit distribution", () => {
    const output = onlyLowSetting(correctionMachine())!;
    const explanations = output.calcSpec!.items.map(({ k, v }) => `${k} ${v}`).join("\n");
    expect(explanations).toContain("収集元として記載された店舗");
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

describe("opted-in setting-1 profile specification parity", () => {
  function optedIn(): Machine {
    const input = correctionMachine();
    input.setting1Correction!.profileSpecVersion = 1;
    for (const profile of [...input.profiles, ...input.setting1Correction!.profiles]) {
      profile.evFilters!.selectionPolicy = { schema: "evlive-axis-policy/v1", startG: 1,
        thresholdPoints: 1, direction: "absolute", interactions: true, initial: "all",
        noData: "not_evaluable", diagnostics: { observedDifference: 1.3 } };
    }
    return input;
  }

  it("accepts new source-shaped corrections and preserves every corrected value", () => {
    const input = optedIn();
    const before = structuredClone(input);
    freezeDeep(input);
    expect(validateMachine(input).setting1Correction).toEqual(before.setting1Correction);
    expect(input).toEqual(before);
  });

  it.each([0, 2, "1", null, {}, []])("rejects unsupported specification version %j", version => {
    const input = optedIn();
    (input.setting1Correction as unknown as Record<string, unknown>).profileSpecVersion = version;
    expect(() => validateMachine(input)).toThrow(/profile specification version/);
  });

  it.each([
    ["aim", (profile: Profile) => { profile.aimKind = "cz"; }],
    ["label", (profile: Profile) => { profile.label += "別の狙い方"; }],
    ["stopping condition", (profile: Profile) => { profile.ceiling += "／次のATまで続行"; }],
    ["starting game", (profile: Profile) => { profile.gRange.start -= 1; }],
    ["ending game", (profile: Profile) => { profile.gRange.end += 10; }],
    ["step", (profile: Profile) => { profile.gRange.step = 20; }],
    ["active selectors", (profile: Profile) => { profile.activeAxes = []; }],
    ["sample unit", (profile: Profile) => { profile.sessionUnit = "別区間"; }],
    ["sample definition", (profile: Profile) => { profile.sampleNote = "別の当たりで区切る"; }],
    ["filter name", (profile: Profile) => { profile.evFilters!.axes![0].label = "別の回数"; }],
    ["filter default", (profile: Profile) => { profile.evFilters!.axes![0].allLabel = "0回のみ"; }],
    ["filter options", (profile: Profile) => { profile.evFilters!.axes![0].options.push({ value: "2", label: "2回" }); }],
    ["legacy filter options", (profile: Profile) => { profile.evFilters!.cz = ["0", "1"]; }],
    ["filter policy", (profile: Profile) => { profile.evFilters!.selectionPolicy!.thresholdPoints = 2; }],
  ] as const)("rejects a new correction that changes the source %s", (_name, change) => {
    const input = optedIn();
    change(input.setting1Correction!.profiles[0]);
    expect(() => validateMachine(input)).toThrow(/must preserve the source specification/);
  });

  it("keeps old published bundles readable until their producer opts in", () => {
    const legacy = correctionMachine();
    legacy.setting1Correction!.profiles[0].ceiling = "旧生成物の別表記";
    legacy.setting1Correction!.profiles[0].evFilters!.axes![0].allLabel = "旧既定条件";
    expect(() => validateMachine(legacy)).not.toThrow();
    legacy.setting1Correction!.profileSpecVersion = 1;
    expect(() => validateMachine(legacy)).toThrow(/must preserve the source specification/);
  });

  it("allows corrected cash, time, derived zones and policy diagnostics to differ", () => {
    const input = optedIn();
    const corrected = input.setting1Correction!.profiles[0];
    corrected.zones = [{ g: corrected.gRange.start, label: "補正後のゾーン" }];
    corrected.baseAnchors[0].playG = 321;
    corrected.evFilters!.tables.c1.baseAnchors[0].playG = 123;
    corrected.evFilters!.selectionPolicy!.diagnostics = { observedDifference: 0.7 };
    expect(() => validateMachine(input)).not.toThrow();
    expect(onlyLowSetting(input)!.profiles[0]).toEqual(corrected);
  });

  it("compares JSON objects independently of insertion order", () => {
    const input = optedIn();
    const corrected = input.setting1Correction!.profiles[0];
    const { start, end, step } = corrected.gRange;
    corrected.gRange = { step, end, start };
    const policy = corrected.evFilters!.selectionPolicy!;
    corrected.evFilters!.selectionPolicy = Object.fromEntries(Object.entries(policy).reverse());
    expect(() => validateMachine(input)).not.toThrow();
  });

  it("keeps heaven-band cash aggregations independent from shared filter declarations", () => {
    const input = optedIn();
    const source = input.profiles[0];
    const corrected = input.setting1Correction!.profiles[0];
    source.key = corrected.key = "heaven_4652";
    const aggregate = {
      schema: "evlive-filter-aggregates/v2" as const, axisKeys: [],
      costPerGame: 30.6, exchange: 20, medalsPerGame: 1.53, junzou: 2.6, bet: 3,
      investmentMinimum: "total" as const, roundingEpsilon: 1e-8,
      rows: [[0, 2, 100, 1000]],
    };
    source.evFilters!.tableAggregations = { c1: structuredClone(aggregate) };
    corrected.evFilters!.tableAggregations = { c1: { ...aggregate, rows: [[0, 2, 100, 900]] } };
    corrected.evFilters!.tables.c1.totalPayout = 900;
    expect(() => validateMachine(input)).not.toThrow();
    expect(onlyLowSetting(input)!.profiles[0].evFilters!.tableAggregations!.c1.rows).toEqual([[0, 2, 100, 900]]);
  });
});
