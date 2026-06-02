import { describe, expect, test } from "vitest";
import machineData from "../data/machines/vvv2.json";
import { avgMedals, baseEV, baseRtp, calcEV, calcRow, defaultConditions, generateRows } from "../lib/ev/calc";
import { validateMachine } from "../lib/ev/validate";

const machine = validateMachine(machineData);
const profile = machine.profiles[0];
const conditions = defaultConditions(machine);

describe("EV calculation", () => {
  test("interpolates base EV and RTP", () => {
    expect(baseEV(0, profile)).toBe(-1200);
    expect(baseEV(100, profile)).toBe(-1300);
    expect(baseRtp(0, profile)).toBe(96);
  });

  test("applies modifiers and credit value", () => {
    expect(calcEV(0, { ...conditions, credit: 300 }, profile, machine)).toBe(4800);
    expect(calcEV(0, { ...conditions, prevTrigger: "cz_direct" }, profile, machine)).toBe(-1320);
  });

  test("calculates average medals from remaining games", () => {
    expect(avgMedals(0, profile, machine)).toBe(4500);
    expect(avgMedals(1500, profile, machine)).toBe(0);
  });

  test("keeps EV/RTP/hourly sign aligned for default rows away from terminal zero-hour rows", () => {
    const rows = generateRows(profile, machine, conditions).filter((row) => row.g < profile.gRange.end);
    for (const row of rows) {
      expect(row.rtp >= 100).toBe(row.ev >= 0);
      expect(row.ev >= 0).toBe(row.hourly >= 0);
    }
  });

  test("supports pivot values", () => {
    const rows = generateRows(profile, machine, conditions, { axisKey: "magius", values: ["none", "c1", "c2", "c3"] });
    expect(rows[0].pivotValues?.none).toBe(calcRow(0, conditions, profile, machine).ev);
    expect(rows[0].pivotValues?.c3).toBe(rows[0].pivotValues?.none ? rows[0].pivotValues.none + 980 : 0);
  });
});
