import { describe, expect, it } from "vitest";
import { validateKatanaEstimate, validateMachineKatanaEstimate } from "../lib/ev/katana-estimate";
import { katanaEstimateFixture, unavailableKatanaEstimateFixture } from "./fixtures/katana-estimate";

describe("katana estimate contract", () => {
  it("accepts all 54 synthetic conditions without recalculating published financial values", () => {
    const estimate = katanaEstimateFixture();
    expect(validateKatanaEstimate(estimate)).toBe(estimate);
    expect(estimate.rows).toHaveLength(54);
    expect(validateMachineKatanaEstimate(estimate, "mfc4a14a4", "いざ！番長", "shinjuku")).toBe(estimate);
  });

  it("accepts a complete row set in a different order", () => {
    const estimate = katanaEstimateFixture();
    estimate.rows.reverse();
    expect(validateKatanaEstimate(estimate)).toBe(estimate);
  });

  it("allows observed zero receipts in a ready sample", () => {
    const estimate = katanaEstimateFixture();
    estimate.sample = { count: 2, totalPayout: 0, meanPayout: 0, meanAtGames: 0 };
    expect(validateKatanaEstimate(estimate)).toBe(estimate);
  });

  it("accepts unavailable with no cached rows and null means", () => {
    const estimate = unavailableKatanaEstimateFixture();
    expect(validateKatanaEstimate(estimate)).toBe(estimate);
    if (!estimate.ready) {
      const mean: null = estimate.sample.meanPayout;
      expect(mean).toBeNull();
    }
  });

  it.each([
    ["unknown top-level field", (v: any) => { v.reason = "cached"; }],
    ["missing field", (v: any) => { delete v.quality; }],
    ["schema version", (v: any) => { v.schemaVersion = 2; }],
    ["model version", (v: any) => { v.modelVersion = "future-model"; }],
    ["setting1 claim", (v: any) => { v.classification = "setting1"; }],
    ["revision", (v: any) => { v.sourceRevision = "revision"; }],
    ["source fields", (v: any) => { v.source.date = "2026-09-03"; }],
    ["source name", (v: any) => { v.source.machineName = "別機種"; }],
    ["mixed source", (v: any) => { v.source.hallId = "mixed"; }],
    ["invalid source hall", (v: any) => { v.source.hallId = "../shinjuku"; }],
    ["different cohort", (v: any) => { v.source.cohortCondition = "all"; }],
    ["pullback policy", (v: any) => { v.source.stopPolicy = "follow-pullback"; }],
    ["reversed period", (v: any) => { v.source.periodStart = "2026-10-01"; }],
    ["impossible calendar date", (v: any) => { v.source.periodStart = "2026-02-29"; }],
    ["unformatted date", (v: any) => { v.source.periodEnd = "2026-9-3"; }],
    ["zero-year date", (v: any) => { v.source.periodStart = "0000-01-01"; }],
    ["economics fields", (v: any) => { v.economics.exchange = 20; }],
    ["nonfinite economics", (v: any) => { v.economics.costPerGame = Infinity; }],
    ["zero economics", (v: any) => { v.economics.netPayoutPerAtGame = 0; }],
    ["non-numeric economics", (v: any) => { v.economics.bet = "3"; }],
    ["monetary units", (v: any) => { v.economics.medalYen = 10; }],
    ["time units", (v: any) => { v.economics.gamesPerHour = 700; }],
    ["calibration fields", (v: any) => { v.calibration.rows = []; }],
    ["calibration version", (v: any) => { v.calibration.schemaVersion = 2; }],
    ["calibration model", (v: any) => { v.calibration.modelVersion = "other"; }],
    ["calibration digest", (v: any) => { v.calibration.sha256 = "xyz"; }],
    ["calibration source fields", (v: any) => { delete v.calibration.source.articleVersion; }],
    ["insecure calibration source", (v: any) => { v.calibration.source.url = "http://example.com/source"; }],
    ["invalid calibration URL", (v: any) => { v.calibration.source.url = "https://"; }],
    ["missing viewed time", (v: any) => { v.calibration.source.viewedAt = ""; }],
    ["inverse economics fields", (v: any) => { delete v.calibration.inverseEconomics.bet; }],
    ["replaced inverse scale", (v: any) => { v.calibration.inverseEconomics.conditionalAtRewardScale = 300; }],
    ["missing inverse method", (v: any) => { v.calibration.inverseMethod = " "; }],
    ["missing calibration limitation", (v: any) => { v.calibration.limitations = []; }],
    ["non-string calibration limitation", (v: any) => { v.calibration.limitations = [null]; }],
    ["quality fields", (v: any) => { v.quality.checked = true; }],
    ["invented missing count", (v: any) => { v.quality.missingPayoutSignalCount = 0; }],
    ["normalization claim", (v: any) => { v.quality.normalization = "corrected"; }],
    ["missing quality note", (v: any) => { v.quality.note = " "; }],
    ["missing interpretation note", (v: any) => { v.notes.pop(); }],
    ["empty interpretation note", (v: any) => { v.notes[0] = ""; }],
    ["sample fields", (v: any) => { v.sample.cachedCount = 2; }],
    ["negative count", (v: any) => { v.sample.count = -1; }],
    ["fractional count", (v: any) => { v.sample.count = 1.5; }],
    ["unsafe count", (v: any) => { v.sample.count = Number.MAX_SAFE_INTEGER + 1; }],
    ["negative total", (v: any) => { v.sample.totalPayout = -1; }],
    ["nonfinite total", (v: any) => { v.sample.totalPayout = NaN; }],
    ["null ready mean", (v: any) => { v.sample.meanPayout = null; }],
    ["negative mean", (v: any) => { v.sample.meanPayout = -1; }],
    ["nonfinite mean games", (v: any) => { v.sample.meanAtGames = Infinity; }],
    ["mismatched ready", (v: any) => { v.ready = false; }],
    ["non-boolean ready", (v: any) => { v.ready = 1; }],
    ["mismatched status", (v: any) => { v.status = "unavailable"; }],
    ["rows object", (v: any) => { v.rows = {}; }],
    ["missing row", (v: any) => { v.rows.pop(); }],
    ["extra row", (v: any) => { v.rows.push({ ...v.rows[0] }); }],
    ["duplicate condition", (v: any) => { v.rows[1] = { ...v.rows[0] }; }],
    ["row fields", (v: any) => { v.rows[0].n = 10; }],
    ["missing row result", (v: any) => { delete v.rows[0].hourlyYen; }],
    ["non-boolean state", (v: any) => { v.rows[0].highState = 0; }],
    ["unsupported color", (v: any) => { v.rows[0].color = "green"; }],
    ["unsupported points", (v: any) => { v.rows[0].displayPt = 90; }],
    ["fractional points", (v: any) => { v.rows[0].displayPt = 0.5; }],
    ["zero non-AT games", (v: any) => { v.rows[0].nonAtGames = 0; }],
    ["negative effective rate", (v: any) => { v.rows[0].effectiveAtRate = -0.1; }],
    ["effective rate above one", (v: any) => { v.rows[0].effectiveAtRate = 1.1; }],
    ["zero total games", (v: any) => { v.rows[0].totalGames = 0; }],
    ["nonfinite EV", (v: any) => { v.rows[0].evYen = NaN; }],
    ["nonfinite RTP", (v: any) => { v.rows[0].rtpPct = Infinity; }],
    ["non-numeric hourly", (v: any) => { v.rows[0].hourlyYen = "100"; }],
  ])("rejects %s", (_label, mutate) => {
    const value = katanaEstimateFixture();
    mutate(value);
    expect(() => validateKatanaEstimate(value)).toThrow("Invalid katanaEstimate");
  });

  it.each([
    ["stale rows", (v: any) => { v.rows = katanaEstimateFixture().rows; }],
    ["stale payout mean", (v: any) => { v.sample.meanPayout = 300; }],
    ["stale games mean", (v: any) => { v.sample.meanAtGames = 100; }],
    ["stale total", (v: any) => { v.sample.totalPayout = 600; }],
    ["ready count zero", (v: any) => { v.ready = true; v.status = "ready"; }],
    ["unavailable positive count", (v: any) => { v.sample.count = 2; }],
  ])("rejects unavailable with %s", (_label, mutate) => {
    const value = unavailableKatanaEstimateFixture();
    mutate(value);
    expect(() => validateKatanaEstimate(value)).toThrow("Invalid katanaEstimate");
  });

  it("accepts leap dates and boundary effective rates", () => {
    const value = katanaEstimateFixture();
    value.source.periodStart = "2024-02-29";
    value.rows[0].effectiveAtRate = 0;
    value.rows[1].effectiveAtRate = 1;
    expect(validateKatanaEstimate(value)).toBe(value);
  });

  it("rejects another machine or a foreign hall including mixed", () => {
    const value = katanaEstimateFixture();
    expect(() => validateMachineKatanaEstimate(value, "lycoris", "いざ！番長", "shinjuku")).toThrow("not registered");
    expect(() => validateMachineKatanaEstimate(value, "mfc4a14a4", "別機種", "shinjuku")).toThrow("not registered");
    for (const hall of ["kabuki", "mixed"]) {
      expect(() => validateMachineKatanaEstimate(value, "mfc4a14a4", "いざ！番長", hall)).toThrow("another hall");
    }
    value.source.hallId = "kabuki";
    expect(validateMachineKatanaEstimate(value, "mfc4a14a4", "いざ！番長", "kabuki")).toBe(value);
    expect(validateMachineKatanaEstimate(value, "mfc4a14a4", "いざ！番長")).toBe(value);
  });
});
