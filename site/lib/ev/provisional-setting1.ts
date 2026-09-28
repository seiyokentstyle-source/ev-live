import type { ProvisionalSetting1 } from "./types";

export const PROVISIONAL_SETTING1_LABEL = "公表設定1を仮定した暫定・グラフ未補正の参考表";
const record = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid provisionalSetting1: ${message}`);
}
function fields(value: unknown, keys: string[], name: string): asserts value is Record<string, any> {
  check(record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), `${name} fields`);
}
function near(actual: unknown, expected: number, tolerance = 1e-6): boolean {
  return finite(actual) && Math.abs(actual - expected) <= tolerance;
}
function remaining(probability: number, games: number): number {
  return -Math.expm1(games * Math.log1p(-probability)) / probability;
}
function roundYen(value: number): number {
  const lower = Math.floor(value);
  if (Math.abs(value - lower - 0.5) <= 1e-8) return lower % 2 === 0 ? lower : lower + 1;
  return Math.round(value);
}

/** Replay the declared model. Unknown fields cannot smuggle measured sample claims into the reference. */
export function validateProvisionalSetting1(value: unknown): ProvisionalSetting1 {
  fields(value, ["schemaVersion", "status", "model", "label", "graphCorrected", "historyBased", "note", "sources", "assumptions", "publicInputs", "modelInputs", "rates"], "reference");
  check(value.schemaVersion === 1 && value.status === "provisional" && value.model === "capped-geometric-v1"
    && value.label === PROVISIONAL_SETTING1_LABEL && value.graphCorrected === false && value.historyBased === false,
  "provenance flags and label");
  check(nonempty(value.note), "note required");
  check(Array.isArray(value.assumptions) && value.assumptions.length >= 6 && value.assumptions.every(nonempty), "assumptions required");
  check(Array.isArray(value.sources) && value.sources.length > 0, "sources required");
  for (const source of value.sources) {
    fields(source, ["label", "url"], "source");
    check(nonempty(source.label) && nonempty(source.url) && !/[\u0000-\u0020\\]/.test(source.url), "source label and URL");
    let url: URL;
    try { url = new URL(source.url); } catch { throw new Error("Invalid provisionalSetting1: source URL"); }
    check(url.protocol === "https:" && url.hostname && !url.username && !url.password, "source URL must be safe HTTPS");
  }
  const inputs = value.publicInputs;
  fields(inputs, ["firstHitMeanGames", "setting1Rtp", "medalsPerGame", "bonusNetMedalsPerGame", "nominalCeilingGames"], "publicInputs");
  check(Object.values(inputs).every(finite), "finite publicInputs required");
  const { firstHitMeanGames: mean, setting1Rtp: rtp, medalsPerGame: use, bonusNetMedalsPerGame: net, nominalCeilingGames: ceiling } = inputs;
  check(Number.isSafeInteger(ceiling) && ceiling >= 20 && ceiling <= 5000 && mean > 1 && mean < ceiling
    && rtp > 0 && rtp < 1 && use > 0 && use <= 3 && net > 0 && net <= 20, "publicInputs range");
  let low = 0, high = 1;
  for (let i = 0; i < 90; i++) {
    const middle = (low + high) / 2;
    if (remaining(middle, ceiling) > mean) low = middle;
    else high = middle;
  }
  const probability = (low + high) / 2;
  const payout = mean * (use + 3 * (rtp - 1)) / (1 - 3 * (rtp - 1) / net);
  check(finite(payout) && payout > 0, "positive assumed payout required");
  fields(value.modelInputs, ["bet", "normalHitProbability", "assumedFixedPayout"], "modelInputs");
  check(value.modelInputs.bet === 3 && near(value.modelInputs.normalHitProbability, probability, 1e-12)
    && near(value.modelInputs.assumedFixedPayout, payout, 1e-9), "modelInputs must match publicInputs");
  const expectedRates = [["46/52", 1000 / 46, 1000 / 52], ["50/50", 20, 20]] as const;
  check(Array.isArray(value.rates) && value.rates.length === expectedRates.length, "both rates required");
  for (const [index, [key, loan, credit]] of expectedRates.entries()) {
    const rate = value.rates[index];
    fields(rate, ["key", "label", "loanPerMedal", "creditPerMedal", "anchors"], "rate");
    check(rate.key === key && rate.label === key && near(rate.loanPerMedal, loan, 1e-12)
      && near(rate.creditPerMedal, credit, 1e-12), "rate exchange values");
    check(Array.isArray(rate.anchors) && rate.anchors.length === Math.ceil(ceiling / 10), "complete model rows required");
    for (let row = 0; row < rate.anchors.length; row++) {
      const anchor = rate.anchors[row], g = row * 10;
      fields(anchor, ["g", "ev", "rtp", "inv", "playG"], "anchor (no measured sample fields)");
      const normal = remaining(probability, ceiling - g);
      const investment = normal * use, play = normal + payout / net;
      const profit = payout * credit - investment * loan;
      const ev = roundYen(profit);
      const rawRtp = 100 + profit / (20 * 3 * play) * 100;
      const rounded = Math.round(rawRtp * 10) / 10;
      const expectedRtp = ev >= 0 ? Math.max(rounded, 100) : Math.min(rounded, 99.9);
      // Permit the adjacent decimal only at a rounding tie between Python and JS.
      const decimalTie = Math.abs(rawRtp * 10 - Math.floor(rawRtp * 10) - 0.5) <= 1e-8;
      const validRtp = near(anchor.rtp, expectedRtp, 1e-6) || (decimalTie
        && finite(anchor.rtp) && near(anchor.rtp * 10, Math.round(anchor.rtp * 10), 1e-6)
        && near(anchor.rtp, expectedRtp, 0.100000001));
      check(anchor.g === g && anchor.ev === ev && near(anchor.inv, investment) && near(anchor.playG, play)
        && validRtp && ((anchor.rtp >= 100) === (ev >= 0)), "anchor must match model replay");
    }
  }
  return value as ProvisionalSetting1;
}

/** Explicitly opted-in models only. A valid model for one machine cannot be relabelled as another. */
export function validateMachineProvisionalSetting1(value: unknown, machineId: string): ProvisionalSetting1 {
  const reference = validateProvisionalSetting1(value);
  const registered: Record<string, ProvisionalSetting1["publicInputs"]> = {
    lycoris: { firstHitMeanGames: 328.8, setting1Rtp: 0.979, medalsPerGame: 50 / 31.8, bonusNetMedalsPerGame: 8.4, nominalCeilingGames: 850 },
    worlddai: { firstHitMeanGames: 306.5, setting1Rtp: 0.978, medalsPerGame: 50 / 30, bonusNetMedalsPerGame: 8, nominalCeilingGames: 999 },
  };
  const inputs = Object.hasOwn(registered, machineId) ? registered[machineId] : undefined;
  check(inputs && Object.entries(inputs).every(([key, expected]) =>
    near(reference.publicInputs[key as keyof typeof inputs], expected, 1e-12)), "model is not registered for this machine");
  return reference;
}
