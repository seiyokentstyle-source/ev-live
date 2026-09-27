import type { MachineSummary } from "./ev/types";

export type CollectedMachine = {
  summary: MachineSummary;
  pendingReason: string;
  reasonCode: string;
  collectionComplete: boolean;
  expectedUnits?: number;
};

export type CollectionStatusEntry = CollectedMachine & { forcePending: boolean };

const CODES = new Set(["sample_insufficient", "payout_unavailable", "spec_unverified",
  "collection_incomplete", "signal_unverified", "validation_pending"]);
const record = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === "object" && !Array.isArray(value));
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid collection status: ${message}`);
}
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** This public shape intentionally has no EV, payout, economics or replay fields. */
export function validateCollectedMachine(value: unknown): CollectedMachine {
  check(record(value) && record(value.summary), "summary required");
  const summary = value.summary;
  check(typeof summary.id === "string" && /^[a-z0-9]{1,40}$/.test(summary.id), "invalid id");
  for (const key of ["name", "manufacturer"] as const) check(typeof summary[key] === "string" && summary[key].trim(), `${key} required`);
  check(Array.isArray(summary.aliases) && summary.aliases.every((alias: unknown) => typeof alias === "string"), "aliases required");
  check((summary.releaseDate === null || validDate(summary.releaseDate)) && validDate(summary.lastUpdated), "invalid machine date");
  check(summary.available === true && summary.thumb === null, "invalid observation metadata");
  check(record(summary.meta) && summary.meta.samples === "0" && typeof summary.meta.source === "string", "observations are not EV samples");
  const collection = summary.meta.collection;
  check(record(collection), "collection required");
  for (const key of ["rows", "events", "units", "days"] as const) {
    check(Number.isSafeInteger(collection[key]) && collection[key] >= (key === "units" || key === "days" ? 1 : 0), `invalid ${key}`);
  }
  check(collection.events <= collection.rows, "events exceed rows");
  check(validDate(collection.firstDate) && validDate(collection.lastDate)
    && collection.firstDate <= collection.lastDate && collection.lastDate === summary.lastUpdated, "invalid collection dates");
  check(collection.days <= (Date.parse(collection.lastDate) - Date.parse(collection.firstDate)) / 86400000 + 1, "days exceed date range");
  check(typeof value.pendingReason === "string" && value.pendingReason.trim(), "reason required");
  check(CODES.has(value.reasonCode), "invalid reason code");
  check(typeof value.collectionComplete === "boolean", "collection completeness required");
  if (value.expectedUnits !== undefined) check(Number.isSafeInteger(value.expectedUnits) && value.expectedUnits > 0, "invalid expected units");
  return {
    summary: { id: summary.id, name: summary.name, manufacturer: summary.manufacturer,
      aliases: [...summary.aliases], releaseDate: summary.releaseDate, lastUpdated: summary.lastUpdated,
      available: true, thumb: null, meta: { samples: "0", source: summary.meta.source,
        collection: { rows: collection.rows, events: collection.events, units: collection.units, days: collection.days,
          firstDate: collection.firstDate, lastDate: collection.lastDate } } },
    pendingReason: value.pendingReason, reasonCode: value.reasonCode,
    collectionComplete: value.collectionComplete,
    ...(value.expectedUnits === undefined ? {} : { expectedUnits: value.expectedUnits }),
  };
}

export function validateCollectionCatalog(value: unknown, hallId: string): CollectionStatusEntry[] {
  check(record(value) && value.schema === "evlive-collection-status/v1", "unsupported schema");
  const storePattern = value.source === "daidata" ? /^[0-9]{6}$/ : value.source === "site_seven" ? /^[0-9]{4,16}$/ : null;
  check(value.hallId === hallId && storePattern && typeof value.storeId === "string" && storePattern.test(value.storeId), "source mismatch");
  check(validDate(value.lastUpdated) && Array.isArray(value.machines), "invalid catalog");
  const seen = new Set<string>();
  return value.machines.map((item: unknown) => {
    check(record(item) && item.status === "pending" && typeof item.forcePending === "boolean", "invalid pending entry");
    check(!seen.has(item.id), "duplicate machine id");
    seen.add(item.id);
    const proof = item.sourceIntegrity;
    check(record(proof) && proof.schemaVersion === 1 && proof.hallId === hallId
      && typeof proof.machineName === "string" && proof.machineName.trim()
      && Array.isArray(item.aliases) && item.aliases.includes(item.name) && item.aliases.includes(proof.machineName)
      && proof.targetDate === item.lastUpdated
      && typeof proof.inputSha256 === "string" && /^[a-f0-9]{64}$/.test(proof.inputSha256), "invalid source identity");
    check(item.lastUpdated <= value.lastUpdated, "entry exceeds catalog date");
    const entry = validateCollectedMachine({
      summary: { id: item.id, name: item.name, manufacturer: item.manufacturer, aliases: item.aliases,
        releaseDate: item.releaseDate, lastUpdated: item.lastUpdated, available: true, thumb: null,
        meta: { samples: "0", source: `保存済み履歴（${item.collection?.firstDate}〜${item.collection?.lastDate}）／期待値算出保留`,
          collection: item.collection } },
      pendingReason: item.pendingReason, reasonCode: item.reasonCode,
      collectionComplete: item.collectionComplete, expectedUnits: item.expectedUnits,
    });
    return { ...entry, forcePending: item.forcePending };
  });
}
