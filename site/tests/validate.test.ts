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
});
