import type { CounterEstimate } from "./types";

export const COUNTER_ESTIMATE_LABEL = "カウンター履歴から計算した推定期待値表（獲得枚数は推定）";
const GROUP_KEYS = ["all", "after_kake", "after_normal", "after_upper"] as const;
const RATES = [["46/52", 1000 / 46, 1000 / 52], ["50/50", 20, 20]] as const;
/** 履歴から計算する機種だけ。別機種への付け替えを受け入れない。 */
const REGISTERED = new Set(["lycoris"]);

const record = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid counterEstimate: ${message}`);
}
function fields(value: unknown, keys: string[], name: string): asserts value is Record<string, any> {
  check(record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), `${name} fields`);
}

/** 形と来歴フラグを検証する。数値の再計算は履歴を持つ生成側が行う。 */
export function validateCounterEstimate(value: unknown): CounterEstimate {
  fields(value, ["schemaVersion", "status", "model", "label", "historyBased", "graphCorrected", "note", "assumptions", "summary", "groups"], "estimate");
  check(value.schemaVersion === 1 && value.status === "estimate" && value.model === "lycoris-counter-v1"
    && value.label === COUNTER_ESTIMATE_LABEL && value.historyBased === true && value.graphCorrected === false,
  "provenance flags and label");
  check(nonempty(value.note), "note required");
  check(Array.isArray(value.assumptions) && value.assumptions.length >= 5 && value.assumptions.every(nonempty), "assumptions required");
  const summary = value.summary;
  fields(summary, ["unitDays", "firstDate", "lastDate", "excludedDates", "assumedAverageSetting", "assumedRtp", "firstHitGames",
    "meanPayout", "normalBonus", "upperBonus", "kakeShare", "normalShare", "upperShare"], "summary");
  check(Number.isSafeInteger(summary.unitDays) && summary.unitDays > 0, "unitDays");
  check(isDate(summary.firstDate) && isDate(summary.lastDate) && summary.firstDate <= summary.lastDate, "date range");
  check(Array.isArray(summary.excludedDates) && summary.excludedDates.every(isDate), "excludedDates");
  for (const key of ["assumedAverageSetting", "assumedRtp", "firstHitGames", "meanPayout", "normalBonus", "upperBonus"] as const) {
    check(finite(summary[key]) && summary[key] > 0, `summary.${key}`);
  }
  check(summary.assumedAverageSetting >= 1 && summary.assumedAverageSetting <= 6, "assumedAverageSetting range");
  const shares = [summary.kakeShare, summary.normalShare, summary.upperShare];
  check(shares.every(share => finite(share) && share >= 0 && share <= 1)
    && Math.abs(shares.reduce((a, b) => a + b, 0) - 1) <= 0.01, "AT shares");
  check(Array.isArray(value.groups) && value.groups.length === GROUP_KEYS.length, "groups");
  for (const [index, key] of GROUP_KEYS.entries()) {
    const group = value.groups[index];
    fields(group, ["key", "label", "rates"], "group");
    check(group.key === key && nonempty(group.label), "group key");
    check(Array.isArray(group.rates) && group.rates.length === RATES.length, "both rates required");
    for (const [rateIndex, [rateKey, loan, credit]] of RATES.entries()) {
      const rate = group.rates[rateIndex];
      fields(rate, ["key", "label", "loanPerMedal", "creditPerMedal", "anchors"], "rate");
      check(rate.key === rateKey && rate.label === rateKey && finite(rate.loanPerMedal) && Math.abs(rate.loanPerMedal - loan) <= 1e-9
        && finite(rate.creditPerMedal) && Math.abs(rate.creditPerMedal - credit) <= 1e-9, "rate exchange values");
      check(Array.isArray(rate.anchors), "anchors");
      if (key === "all") check(rate.anchors.length > 0, "overall table requires rows");
      rate.anchors.forEach((anchor: unknown, row: number) => {
        fields(anchor, ["g", "n", "ev", "rtp", "inv", "playG"], "anchor");
        check(anchor.g === row * 10, "rows must be consecutive 10G steps from 0G");
        check(Number.isSafeInteger(anchor.n) && anchor.n > 0 && (row === 0 || anchor.n <= rate.anchors[row - 1].n), "sample counts");
        check(Number.isSafeInteger(anchor.ev) && finite(anchor.rtp) && finite(anchor.inv) && anchor.inv >= 0
          && finite(anchor.playG) && anchor.playG >= 0, "finite row values");
      });
    }
  }
  return value as CounterEstimate;
}

export function validateMachineCounterEstimate(value: unknown, machineId: string): CounterEstimate {
  const estimate = validateCounterEstimate(value);
  check(REGISTERED.has(machineId), "estimate is not registered for this machine");
  return estimate;
}
