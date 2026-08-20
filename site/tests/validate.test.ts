import { describe, expect, test } from "vitest";
import machineData from "../../data/machines/vvv2.json";
import { validateMachine } from "../lib/ev/validate";

describe("machine validation", () => {
  test("accepts vvv2 data", () => {
    expect(validateMachine(machineData).id).toBe("vvv2");
  });

  test("rejects EV/RTP sign mismatches", () => {
    const invalid = structuredClone(machineData);
    invalid.profiles[0].baseAnchors[0].rtp = 101;
    expect(() => validateMachine(invalid)).toThrow(/sign mismatch/);
  });

  test("rejects negative anchor inv", () => {
    const invalid = structuredClone(machineData) as Record<string, unknown>;
    (invalid.profiles as Array<{ baseAnchors: Array<{ inv?: number }> }>)[0].baseAnchors[0].inv = -5;
    expect(() => validateMachine(invalid)).toThrow(/inv must be a non-negative number/);
  });

  test("rejects dangerous thumb URLs", () => {
    const invalid = structuredClone(machineData) as Record<string, unknown>;
    invalid.thumb = "javascript:alert(1)";
    expect(() => validateMachine(invalid)).toThrow(/thumb/);
  });

  test("accepts safe thumb URLs", () => {
    const httpsThumb = structuredClone(machineData) as Record<string, unknown>;
    httpsThumb.thumb = "https://example.com/a.png";
    expect(validateMachine(httpsThumb).thumb).toBe("https://example.com/a.png");

    const relativeThumb = structuredClone(machineData) as Record<string, unknown>;
    relativeThumb.thumb = "/thumbs/a.png";
    expect(validateMachine(relativeThumb).thumb).toBe("/thumbs/a.png");
  });

  test("rejects missing economics", () => {
    const invalid = structuredClone(machineData) as Record<string, unknown>;
    delete invalid.economics;
    expect(() => validateMachine(invalid)).toThrow(/economics are required/);
  });

  test("accepts data without settingAim (optional)", () => {
    const base = structuredClone(machineData) as Record<string, unknown>;
    delete base.settingAim;
    expect(validateMachine(base).settingAim).toBeUndefined();
  });

  test("accepts a well-formed settingAim", () => {
    const withAim = structuredClone(machineData) as Record<string, unknown>;
    withAim.settingAim = {
      label: "設定狙い（台番号別 推定出率）",
      unit: "%",
      note: "出率＝OUT÷IN",
      dates: ["2026-06-12", "2026-06-13"],
      units: [
        { unit: "101", avg: 103.2, days: 2, rates: [101.0, 105.4], games: [3200, 4100], net: 640 },
        { unit: "102", avg: 96.1, days: 1, rates: [96.1, null], games: [2800, 0], net: -210 }
      ]
    };
    expect(validateMachine(withAim).settingAim?.units).toHaveLength(2);
  });

  test("rejects settingAim games that do not align with dates", () => {
    const invalid = structuredClone(machineData) as Record<string, unknown>;
    invalid.settingAim = {
      label: "x",
      unit: "%",
      note: "x",
      dates: ["2026-06-12", "2026-06-13"],
      units: [{ unit: "101", avg: 100, days: 1, rates: [100, null], games: [3000], net: 0 }]
    };
    expect(() => validateMachine(invalid)).toThrow(/games must align/);
  });

  test("rejects settingAim rows whose rates do not align with dates", () => {
    const invalid = structuredClone(machineData) as Record<string, unknown>;
    invalid.settingAim = {
      label: "x",
      unit: "%",
      note: "x",
      dates: ["2026-06-12", "2026-06-13"],
      units: [{ unit: "101", avg: 100, days: 1, rates: [100], net: 0 }]
    };
    expect(() => validateMachine(invalid)).toThrow(/rates must align/);
  });

  test("accepts data without atPayout (optional)", () => {
    const base = structuredClone(machineData) as Record<string, unknown>;
    delete base.atPayout;
    expect(validateMachine(base).atPayout).toBeUndefined();
  });

  test("accepts a well-formed atPayout", () => {
    const withPayout = structuredClone(machineData) as Record<string, unknown>;
    withPayout.atPayout = {
      step: 50,
      label: "AT初当たり時 平均獲得（当選G帯別）",
      note: "x",
      bands: [
        { lo: 0, hi: 50, count: 1, mean: 781.0, median: 781 },
        { lo: 50, hi: 100, count: 32, mean: 688.9, median: 615 }
      ]
    };
    expect(validateMachine(withPayout).atPayout?.bands).toHaveLength(2);
  });

  test("rejects atPayout band with hi <= lo", () => {
    const invalid = structuredClone(machineData) as Record<string, unknown>;
    invalid.atPayout = {
      step: 50,
      label: "x",
      note: "x",
      bands: [{ lo: 100, hi: 100, count: 5, mean: 500, median: 480 }]
    };
    expect(() => validateMachine(invalid)).toThrow(/atPayout band 100 range is invalid/);
  });

  test("accepts data without harakiri (optional)", () => {
    const base = structuredClone(machineData) as Record<string, unknown>;
    delete base.harakiri;
    expect(validateMachine(base).harakiri).toBeUndefined();
  });

  test("accepts a well-formed harakiri", () => {
    const withHk = structuredClone(machineData) as Record<string, unknown>;
    withHk.harakiri = {
      label: "ハラキリドライブ（台別・推定）",
      note: "x",
      threshold: 400,
      total: { sessions: 100, rush: 40, hits: 6, rate: 15.0 },
      units: [
        { unit: "791", sessions: 50, rush: 22, hits: 4, rate: 18.2 },
        { unit: "792", sessions: 50, rush: 18, hits: 2, rate: 11.1 }
      ]
    };
    expect(validateMachine(withHk).harakiri?.units).toHaveLength(2);
  });

  test("accepts harakiri unit with hits exceeding rush (1ラッシュで複数回ハラキリ→rate>100%)", () => {
    const valid = structuredClone(machineData) as Record<string, unknown>;
    valid.harakiri = {
      label: "x",
      note: "x",
      threshold: 400,
      total: { sessions: 10, rush: 4, hits: 10, rate: 250.0 },
      units: [{ unit: "791", sessions: 10, rush: 4, hits: 10, rate: 250.0 }]
    };
    expect(() => validateMachine(valid)).not.toThrow();
  });

  test("rejects harakiri with non-positive threshold", () => {
    const invalid = structuredClone(machineData) as Record<string, unknown>;
    invalid.harakiri = {
      label: "x",
      note: "x",
      threshold: 0,
      total: { sessions: 1, rush: 1, hits: 0, rate: 0 },
      units: [{ unit: "791", sessions: 1, rush: 1, hits: 0, rate: 0 }]
    };
    expect(() => validateMachine(invalid)).toThrow(/threshold must be > 0/);
  });
});
