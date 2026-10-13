import type { Setting1Correction } from "./types";

export type OfficialCalibration = {
  schemaVersion: 1;
  status: "matched" | "held";
  method: "session-payout-linear-v1";
  source: "user-provided-reference";
  assumptions: string[];
  sessionCount: number;
  payoutScale: number | null;
  checks: Array<{
    key: string; targetRtpPercent: number; actualRtpPercent: number | null;
    displayRtpPercent: number | null; status: "matched" | "held"; op: "eq" | "gte";
    samples: number; normalGames: number; source: string; reason?: string;
  }>;
  unsupportedReferences: Array<{ key: string; targetRtpPercent: number; status: "held"; reason: string }>;
};

const targets: Record<string, [number, "eq" | "gte", string | null, number]> = {
  reset_0_600: [100, "gte", "reset_5050", 0],
  normal_300_850: [100.3, "eq", "after_other_5050", 300],
  normal_400_850: [106.1, "eq", "after_other_5050", 400],
  after_upper_0_850: [105.1, "eq", "after_upper_5050", 0],
  zone_50_100: [105.7, "eq", "zone_50_100_5050", 50],
  zone_150_250: [101, "eq", "zone_150_250_5050", 150],
  overall_0: [97.9, "eq", null, 0],
};
function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Invalid official calibration: ${message}`);
}

export function validateOfficialCalibration(id: string, correction: Setting1Correction): void {
  const report = correction.calibration;
  requireValue(id === "lycoris" && correction.sourceHallId === "mixed"
    && correction.targetRtp === 0.979 && report
    && report.schemaVersion === 1 && report.status === "matched"
    && report.method === "session-payout-linear-v1" && report.source === "user-provided-reference", "identity");
  requireValue(Array.isArray(report.assumptions) && report.assumptions.length > 0
    && report.assumptions.every(v => typeof v === "string" && v.trim())
    && Number.isSafeInteger(report.sessionCount) && report.sessionCount > 0
    && Number.isFinite(report.payoutScale) && report.payoutScale !== null
    && Math.abs(report.payoutScale - correction.payoutScale) < 1e-9, "summary");
  requireValue(Array.isArray(report.checks) && report.checks.length === Object.keys(targets).length
    && new Set(report.checks.map(c => c.key)).size === Object.keys(targets).length, "checks");
  for (const check of report.checks) {
    const target = targets[check.key];
    requireValue(target && check.status === "matched" && check.op === target[1]
      && check.source === (check.key === "overall_0" ? "published-setting1-rtp" : "user-provided-reference")
      && check.targetRtpPercent === target[0] && typeof check.actualRtpPercent === "number"
      && Number.isFinite(check.actualRtpPercent)
      && (target[1] === "eq" ? Math.abs(check.actualRtpPercent - target[0]) <= 1e-5
        : check.actualRtpPercent >= target[0] - 1e-5)
      && check.displayRtpPercent === Math.round(check.actualRtpPercent * 10) / 10
      && Number.isSafeInteger(check.samples) && check.samples > 0 && check.samples <= report.sessionCount
      && Number.isFinite(check.normalGames) && check.normalGames >= 0, "target mismatch");
    if (target[2]) {
      const anchor = correction.profiles.find(p => p.key === target[2])?.baseAnchors.find(a => a.g === target[3]);
      requireValue(anchor && Number.isFinite(anchor.rtp) && anchor.rtp === check.displayRtpPercent
        && (target[1] === "eq" ? Math.abs(anchor.rtp - target[0]) < 0.051 : anchor.rtp >= target[0]), "anchor mismatch");
    }
  }
  const held = report.unsupportedReferences;
  requireValue(Array.isArray(held) && held.length === 1 && held[0].key === "upper_cz_failed_0_250"
    && held[0].targetRtpPercent === 103.9 && held[0].status === "held"
    && held[0].reason === "cohort_unobservable", "unobserved cohort");
}
