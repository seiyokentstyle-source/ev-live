export const KATANA_COLORS = ["blue", "yellow", "red"] as const;
export const KATANA_DISPLAY_POINTS = [0, 10, 20, 30, 40, 50, 60, 70, 80] as const;

export type KatanaColor = typeof KATANA_COLORS[number];
export type KatanaDisplayPoint = typeof KATANA_DISPLAY_POINTS[number];

export type KatanaEstimateRow = {
  highState: boolean;
  color: KatanaColor;
  displayPt: KatanaDisplayPoint;
  nonAtGames: number;
  effectiveAtRate: number;
  evYen: number;
  rtpPct: number;
  totalGames: number;
  hourlyYen: number;
};

export type KatanaEstimateCalibration = {
  schemaVersion: 1;
  modelVersion: "izaban-katana-conditional-inverse-v1";
  source: {
    url: string;
    articleVersion: string;
    viewedAt: string;
    conditions: string;
  };
  inverseEconomics: {
    costPerGame: 1.5625;
    netPayoutPerAtGame: 3;
    conditionalAtRewardScale: 577.08;
    medalYen: 20;
    bet: 3;
  };
  inverseMethod: string;
  limitations: string[];
  sha256: string;
};

type KatanaEstimateMetadata = {
  schemaVersion: 1;
  modelVersion: "izaban-katana-conditional-inverse-v1";
  classification: "setting-unadjusted-proxy";
  source: {
    machineName: "いざ！番長";
    hallId: string;
    periodStart: string;
    periodEnd: string;
    cohortCondition: "normal-main; 50 <= firstHitGame % 100 <= 99";
    stopPolicy: "first-at-end-no-pullback";
  };
  economics: {
    costPerGame: number;
    netPayoutPerAtGame: number;
    bet: number;
    medalYen: 20;
    gamesPerHour: 800;
  };
  calibration: KatanaEstimateCalibration;
  quality: {
    missingPayoutSignalCount: null;
    normalization: "existing-zero";
    note: string;
  };
  notes: string[];
  sourceRevision: string;
};

export type KatanaEstimate = KatanaEstimateMetadata & ({
  status: "ready";
  ready: true;
  sample: { count: number; totalPayout: number; meanPayout: number; meanAtGames: number };
  rows: KatanaEstimateRow[];
} | {
  status: "unavailable";
  ready: false;
  sample: { count: 0; totalPayout: 0; meanPayout: null; meanAtGames: null };
  rows: [];
});

const MODEL_VERSION = "izaban-katana-conditional-inverse-v1";
const MACHINE_ID = "mfc4a14a4";
const MACHINE_NAME = "いざ！番長";
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const physicalHall = (value: unknown): value is string =>
  typeof value === "string" && value !== "mixed" && /^[a-z0-9][a-z0-9_-]*$/.test(value);

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid katanaEstimate: ${message}`);
}

function fields(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  check(isRecord(value) && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key)), `${label} fields`);
}

function isoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function httpsUrl(value: unknown): value is string {
  if (!nonempty(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Validate the published contract. Receipt, EV and revision arithmetic belongs to the producer. */
export function validateKatanaEstimate(value: unknown): KatanaEstimate {
  fields(value, ["schemaVersion", "modelVersion", "classification", "status", "ready", "source", "sample",
    "economics", "calibration", "quality", "notes", "rows", "sourceRevision"], "estimate");
  check(value.schemaVersion === 1 && value.modelVersion === MODEL_VERSION
    && value.classification === "setting-unadjusted-proxy", "interpretation");
  check(digest(value.sourceRevision), "sourceRevision");

  const source = value.source;
  fields(source, ["machineName", "hallId", "periodStart", "periodEnd", "cohortCondition", "stopPolicy"], "source");
  check(source.machineName === MACHINE_NAME && physicalHall(source.hallId), "source identity");
  check(source.cohortCondition === "normal-main; 50 <= firstHitGame % 100 <= 99"
    && source.stopPolicy === "first-at-end-no-pullback", "cohort and stop policy");
  check(isoDate(source.periodStart) && isoDate(source.periodEnd) && source.periodStart <= source.periodEnd, "source period");

  const economics = value.economics;
  fields(economics, ["costPerGame", "netPayoutPerAtGame", "bet", "medalYen", "gamesPerHour"], "economics");
  check(Object.values(economics).every(number => finite(number) && number > 0), "positive economics");
  check(economics.medalYen === 20 && economics.gamesPerHour === 800, "monetary and time units");

  const calibration = value.calibration;
  fields(calibration, ["schemaVersion", "modelVersion", "source", "inverseEconomics", "inverseMethod", "limitations", "sha256"], "calibration");
  check(calibration.schemaVersion === 1 && calibration.modelVersion === MODEL_VERSION
    && digest(calibration.sha256), "calibration version and digest");
  const externalSource = calibration.source;
  fields(externalSource, ["url", "articleVersion", "viewedAt", "conditions"], "calibration source");
  check(httpsUrl(externalSource.url) && Object.values(externalSource).every(nonempty), "calibration source metadata");
  const inverse = calibration.inverseEconomics;
  fields(inverse, ["costPerGame", "netPayoutPerAtGame", "conditionalAtRewardScale", "medalYen", "bet"], "inverse economics");
  check(inverse.costPerGame === 1.5625 && inverse.netPayoutPerAtGame === 3
    && inverse.conditionalAtRewardScale === 577.08 && inverse.medalYen === 20 && inverse.bet === 3,
  "original inverse assumptions");
  check(nonempty(calibration.inverseMethod) && Array.isArray(calibration.limitations)
    && calibration.limitations.length > 0 && calibration.limitations.every(nonempty), "calibration limitations");

  const quality = value.quality;
  fields(quality, ["missingPayoutSignalCount", "normalization", "note"], "quality");
  check(quality.missingPayoutSignalCount === null && quality.normalization === "existing-zero"
    && nonempty(quality.note), "unmeasured payout quality");
  check(Array.isArray(value.notes) && value.notes.length === 5 && value.notes.every(nonempty), "interpretation notes");

  const sample = value.sample;
  fields(sample, ["count", "totalPayout", "meanPayout", "meanAtGames"], "sample");
  check(Number.isSafeInteger(sample.count) && (sample.count as number) >= 0, "sample count");
  check(finite(sample.totalPayout) && sample.totalPayout >= 0, "sample totalPayout");
  check(typeof value.ready === "boolean" && value.ready === ((sample.count as number) > 0), "sample readiness");
  check(Array.isArray(value.rows), "rows must be an array");
  if (!value.ready) {
    check(value.status === "unavailable" && sample.count === 0 && sample.totalPayout === 0
      && sample.meanPayout === null && sample.meanAtGames === null && value.rows.length === 0,
    "unavailable result must have zero count, null means and no stale rows");
  } else {
    check(value.status === "ready" && value.rows.length === 54, "ready result requires 54 conditions");
    check(finite(sample.meanPayout) && sample.meanPayout >= 0
      && finite(sample.meanAtGames) && sample.meanAtGames >= 0, "sample means");
    const found = new Set<string>();
    for (const row of value.rows) {
      fields(row, ["highState", "color", "displayPt", "nonAtGames", "effectiveAtRate", "evYen", "rtpPct", "totalGames", "hourlyYen"], "row");
      check(typeof row.highState === "boolean" && KATANA_COLORS.some(color => color === row.color)
        && KATANA_DISPLAY_POINTS.some(point => point === row.displayPt), "supported row condition");
      const key = `${row.highState}:${row.color}:${row.displayPt}`;
      check(!found.has(key), "duplicate row condition");
      found.add(key);
      check(finite(row.nonAtGames) && row.nonAtGames > 0, "row nonAtGames");
      check(finite(row.effectiveAtRate) && row.effectiveAtRate >= 0 && row.effectiveAtRate <= 1, "row effectiveAtRate");
      check(finite(row.totalGames) && row.totalGames > 0, "row totalGames");
      check(finite(row.evYen) && finite(row.rtpPct) && finite(row.hourlyYen), "finite published results");
    }
    // There are exactly 54 supported combinations; uniqueness therefore also proves completeness.
    check(found.size === 54, "complete row conditions");
  }
  return value as KatanaEstimate;
}

/** Bind an attachment to its producer's machine and, where available, the requested physical hall. */
export function validateMachineKatanaEstimate(value: unknown, machineId: string, machineName: string, hallId?: string): KatanaEstimate {
  const estimate = validateKatanaEstimate(value);
  check(machineId === MACHINE_ID && machineName === MACHINE_NAME, "estimate is not registered for this machine");
  check(hallId === undefined || estimate.source.hallId === hallId, "estimate belongs to another hall");
  return estimate;
}
