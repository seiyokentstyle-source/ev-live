import type { EvFilters, Profile } from "./types";

// The correction producer opts into this contract with profileSpecVersion=1.
// These are choices describing how to play/filter, rather than results of the
// payout correction. Cohort counts and investments are checked by the producer.
const PROFILE_FIELDS = [
  "key", "label", "aimKind", "ceiling", "gRange", "activeAxes", "sessionUnit", "sampleNote",
] as const;
const FILTER_FIELDS = [
  "axes", "tails", "days", "cz", "czAll", "czTerm", "pay", "payLabels", "payAll",
] as const;
const POLICY_FIELDS = [
  "schema", "startG", "thresholdPoints", "direction", "interactions", "initial", "noData",
] as const;

function pick(value: object, keys: readonly string[]): Record<string, unknown> {
  const record = value as Record<string, unknown>;
  return Object.fromEntries(keys.filter(key => record[key] !== undefined).map(key => [key, record[key]]));
}

function filterSpec(filters: EvFilters): Record<string, unknown> {
  return {
    ...pick(filters, FILTER_FIELDS),
    ...(filters.selectionPolicy === undefined ? {} : {
      selectionPolicy: pick(filters.selectionPolicy, POLICY_FIELDS),
    }),
  };
}

function profileSpec(profile: Profile): Record<string, unknown> {
  return {
    ...pick(profile, PROFILE_FIELDS),
    ...(profile.evFilters === undefined ? {} : { evFilters: filterSpec(profile.evFilters) }),
  };
}

// JSON object insertion order is not a specification difference. Array order
// remains significant for tabs, selected axes and displayed choices.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}

export function validateSetting1ProfileSpecs(source: Profile[], corrected: Profile[]): void {
  if (source.length !== corrected.length) {
    throw new Error("Invalid machine data: setting1Correction must preserve the source profile count");
  }
  for (let i = 0; i < source.length; i += 1) {
    const original = source[i];
    const correction = corrected[i];
    if (JSON.stringify(canonical(profileSpec(original))) !== JSON.stringify(canonical(profileSpec(correction)))) {
      throw new Error(`Invalid machine data: setting1Correction profile ${original.key} must preserve the source specification`);
    }
  }
}
