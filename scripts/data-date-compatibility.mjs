import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const LEGACY_DATA_DATES = JSON.parse(readFileSync(
  new URL("./legacy-data-dates.json", import.meta.url), "utf8"
));

export function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Only the generator's exact all-data period prefix is recognized. */
export function sourcePeriod(data) {
  const source = data?.meta?.source;
  if (typeof source !== "string") return null;
  const match = /^実戦データ自動収集（(\d{4}-\d{2}-\d{2})〜(\d{4}-\d{2}-\d{2})・全データ）(?:／|$)/.exec(source);
  if (!match || !isDate(match[1]) || !isDate(match[2]) || match[1] > match[2]) return null;
  return { start: match[1], end: match[2] };
}

export function snapshotHash(data) {
  // Parsing first makes Git's checkout line endings/whitespace immaterial.
  // Every field and value, including private attachments, remains covered.
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

/**
 * Read-only migration for the exact outputs of the broken 2026-09-13 run.
 * A source string alone never overrides lastUpdated. No generated JSON changes.
 * The same rule on HEAD catches reintroduction of a legacy (older) snapshot.
 */
export function comparisonDate(file, data, manifest = LEGACY_DATA_DATES) {
  const period = sourcePeriod(data);
  // The broken batch also used the all-machine period for stopped machines.
  // Audited per-file ends still require the same exact original snapshot.
  const date = manifest.dataThroughByFile?.[file] ?? manifest.dataThrough;
  const validEnd = isDate(date) && period?.start <= date && date <= manifest.dataThrough;
  const legacy = data.lastUpdated === manifest.recordedLastUpdated
    && period?.end === manifest.dataThrough
    && validEnd
    && manifest.files[file] === snapshotHash(data);
  return { date: legacy ? date : data.lastUpdated, legacy };
}

export function dateRegression(file, base, head, manifest = LEGACY_DATA_DATES) {
  const before = comparisonDate(file, base, manifest);
  const after = comparisonDate(file, head, manifest);
  // A transition out of a verified old snapshot must use the corrected
  // generator convention, not merely an arbitrary date below its run date.
  const correction = before.legacy && !after.legacy && head.lastUpdated < base.lastUpdated;
  const verifiedCorrection = !correction || sourcePeriod(head)?.end === head.lastUpdated;
  return {
    before, after,
    rollback: after.date < before.date || !verifiedCorrection,
    invalidCorrection: !verifiedCorrection,
    migrated: correction && verifiedCorrection && after.date >= before.date
  };
}
