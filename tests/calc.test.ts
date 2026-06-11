import { describe, expect, test } from "vitest";
import machineData from "../data/machines/vvv2.json";
import { avgMedals, baseEV, baseRtp, calcEV, defaultConditions, generateRows } from "../lib/ev/calc";
import { validateMachine } from "../lib/ev/validate";

const machine = validateMachine(machineData);
// First profile is the 実戦データ profile (ゲーム数天井). Later profiles may be data-pending.
const profile = machine.profiles[0];
const conditions = defaultConditions(machine);

describe("EV calculation", () => {
  test("interpolates base EV and RTP", () => {
    expect(baseEV(0, profile)).toBe(-939);
    expect(baseEV(50, profile)).toBe(705);
    // Midpoint between the g0 and g50 anchors.
    expect(baseEV(25, profile)).toBe((-939 + 705) / 2);
    expect(baseRtp(0, profile)).toBe(89.7);
  });

  test("applies rate modifier (no-op at base rate)", () => {
    expect(calcEV(0, conditions, profile, machine)).toBe(-939);
    expect(calcEV(50, conditions, profile, machine)).toBe(705);
  });

  test("calculates average medals from remaining games", () => {
    expect(avgMedals(0, profile, machine)).toBe(Math.round(profile.gRange.end * machine.economics.medalsPerGame));
    expect(avgMedals(profile.gRange.end, profile, machine)).toBe(0);
  });

  test("keeps EV/RTP/hourly sign aligned for sampled rows away from terminal zero-hour rows", () => {
    const lastSampledG = profile.baseAnchors[profile.baseAnchors.length - 1].g;
    const rows = generateRows(profile, machine, conditions).filter((row) => row.g < lastSampledG);
    for (const row of rows) {
      expect(row.rtp >= 100).toBe(row.ev >= 0);
      expect(row.ev >= 0).toBe(row.hourly >= 0);
    }
  });

  test("marks rows past the last sampled anchor as no-data", () => {
    const lastSampledG = profile.baseAnchors[profile.baseAnchors.length - 1].g;
    const rows = generateRows(profile, machine, conditions);
    expect(rows.find((row) => row.g === lastSampledG)?.noData).toBeFalsy();
    const beyond = rows.filter((row) => row.g > lastSampledG);
    expect(beyond.length).toBeGreaterThan(0);
    for (const row of beyond) {
      expect(row.noData).toBe(true);
    }
  });
});

describe("data-pending profiles", () => {
  test("vvv2 exposes data-pending 狙い方 tabs with no anchors", () => {
    const pending = machine.profiles.filter((candidate) => candidate.dataPending);
    expect(pending.length).toBeGreaterThan(0);
    for (const candidate of pending) {
      expect(candidate.baseAnchors).toHaveLength(0);
    }
  });
});
