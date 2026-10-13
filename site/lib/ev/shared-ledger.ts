import type { Setting1Correction } from "./types";

type ReferenceCheck = {
  key: string;
  targetRtpPercent: number;
  actualRtpPercent: number | null;
  displayRtpPercent: number | null;
  status: "compared" | "unavailable";
  op: "eq" | "gte";
  source: string;
  conditionVerified: boolean;
  samples: number;
  normalGames: number;
  totalPlayGames: number;
  reason?: string;
};

export type ReferenceComparison = {
  schemaVersion: 2;
  method: "reference-comparison";
  status: "comparison-only";
  source: "user-provided-reference";
  conditionVerified: false;
  assumptions: string[];
  checks: ReferenceCheck[];
  unsupportedReferences: Array<{
    key: string; targetRtpPercent: number; actualRtpPercent: null;
    status: "unavailable"; op: "eq"; source: string;
    conditionVerified: false; reason: string;
  }>;
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
  if (!value) throw new Error(`Invalid shared ledger: ${message}`);
}

/** Validate the common model and the reported differences; never require target fitting. */
export function validateSharedLedger(id: string, correction: Setting1Correction): void {
  const report = correction.referenceComparison;
  requireValue(id === "lycoris" && correction.sourceHallId === "mixed"
    && correction.targetRtp === 0.979 && correction.calibration === undefined && report
    && report.schemaVersion === 2 && report.method === "reference-comparison"
    && report.status === "comparison-only" && report.source === "user-provided-reference"
    && report.conditionVerified === false, "identity");
  const allowed = new Set(["schemaVersion", "method", "status", "source", "conditionVerified",
    "assumptions", "checks", "unsupportedReferences"]);
  requireValue(Object.keys(report).every(key => allowed.has(key)), "unexpected report fields");
  requireValue(Array.isArray(report.assumptions) && report.assumptions.length > 0
    && report.assumptions.every(value => typeof value === "string" && value.trim()), "assumptions");
  requireValue(Array.isArray(report.checks) && report.checks.length === Object.keys(targets).length
    && new Set(report.checks.map(check => check.key)).size === Object.keys(targets).length, "checks");
  for (const check of report.checks) {
    const checkFields = new Set(["key", "targetRtpPercent", "actualRtpPercent", "displayRtpPercent",
      "status", "op", "source", "conditionVerified", "samples", "normalGames", "totalPlayGames", "reason"]);
    requireValue(Object.keys(check).every(key => checkFields.has(key)), "unexpected comparison fields");
    const target = targets[check.key];
    const overall = check.key === "overall_0";
    requireValue(target && check.op === target[1] && check.targetRtpPercent === target[0]
      && check.source === (overall ? "published-setting1-rtp" : "user-provided-reference")
      && check.conditionVerified === overall
      && Number.isSafeInteger(check.samples) && check.samples >= 0
      && Number.isFinite(check.normalGames) && check.normalGames >= 0
      && Number.isFinite(check.totalPlayGames) && check.totalPlayGames >= check.normalGames - 1e-8,
    "reference condition");
    if (check.status === "unavailable") {
      requireValue(!overall && check.actualRtpPercent === null && check.displayRtpPercent === null
        && typeof check.reason === "string" && check.reason.trim(), "unavailable reference");
      continue;
    }
    requireValue(check.status === "compared" && typeof check.actualRtpPercent === "number"
      && Number.isFinite(check.actualRtpPercent) && check.samples > 0
      && typeof check.displayRtpPercent === "number"
      && Math.abs(check.displayRtpPercent - check.actualRtpPercent) <= 0.05000001,
    "comparison values");
    if (overall) requireValue(Math.abs(check.actualRtpPercent - 97.9) <= 1e-7, "global equation");
    if (target[2]) {
      const anchor = correction.profiles.find(profile => profile.key === target[2])?.baseAnchors.find(row => row.g === target[3]);
      requireValue(anchor && anchor.rtp === check.displayRtpPercent && anchor.n === check.samples, "published comparison");
    }
  }
  const held = report.unsupportedReferences;
  requireValue(Array.isArray(held) && held.length === 1 && held[0].key === "upper_cz_failed_0_250"
    && held[0].targetRtpPercent === 103.9 && held[0].actualRtpPercent === null
    && held[0].status === "unavailable" && held[0].conditionVerified === false
    && held[0].reason === "cohort_unobservable", "unobserved cohort");
  for (const profile of correction.profiles) {
    requireValue(profile.evFilters?.aggregation?.totalPlayGames === true,
      "shared elapsed games required for filters");
  }
}
