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
        { unit: "101", avg: 103.2, days: 2, rates: [101.0, 105.4], net: 640 },
        { unit: "102", avg: 96.1, days: 1, rates: [96.1, null], net: -210 }
      ]
    };
    expect(validateMachine(withAim).settingAim?.units).toHaveLength(2);
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
});
