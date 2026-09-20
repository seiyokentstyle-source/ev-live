import type { FilterAggregationRowPayload, FilterAggregationRowsAsset } from "./types";

const fail = (detail: string): never => { throw new Error(`Invalid machine data: aggregation asset ${detail}`); };
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function validateAggregationRowsAsset(value: unknown): FilterAggregationRowsAsset {
  if (!record(value) || Object.keys(value).some(key => key !== "sha256" && key !== "rowCount") ||
    typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256) ||
    !Number.isSafeInteger(value.rowCount) || (value.rowCount as number) < 0) fail("reference is invalid");
  return value as FilterAggregationRowsAsset;
}

export function aggregationAssetPath(asset: FilterAggregationRowsAsset, basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""): string {
  validateAggregationRowsAsset(asset);
  return `${basePath}/filter-aggregates/${asset.sha256}.json`;
}

/** An asset contains only the old inline row payload, never calculation metadata. */
export function validateAggregationAssetPayload(value: unknown, expectedRows: number): FilterAggregationRowPayload {
  if (!record(value)) fail("payload must be an object");
  const payload = value as Record<string, unknown>;
  if (payload.rows !== undefined) {
    if (Object.keys(payload).some(key => key !== "rows") || !Array.isArray(payload.rows) ||
      payload.rows.length !== expectedRows) fail("row count or plain envelope is invalid");
  } else if (Object.keys(payload).some(key => key !== "rowsGzip" && key !== "rowCount") ||
    typeof payload.rowsGzip !== "string" || !payload.rowsGzip.length || payload.rowsGzip.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.rowsGzip) ||
    !Number.isSafeInteger(payload.rowCount) || payload.rowCount !== expectedRows) {
    fail("row count or compressed envelope is invalid");
  }
  return value as FilterAggregationRowPayload;
}
