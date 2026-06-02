import { describe, expect, test } from "vitest";
import machineData from "../data/machines/vvv2.json";
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
});
