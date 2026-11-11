import type { DecodedFilterAggregation, FilterAggregation, FilterAggregationRowPayload, FilterAxis } from "./types";
import { validateAggregateRows } from "./filter-aggregation-validation";
import { aggregationAssetPath, packedAggregationAssetPayload, validateAggregationAssetPayload } from "./aggregation-asset";
import { unpackRows } from "./rows-pack-core.mjs";
import { validateNormalCostSchedule } from "./normal-cost-core.mjs";

// One active profile and one recently used profile. Never expand a whole machine.
const CACHE_LIMIT = 2;
const cache = new Map<FilterAggregation, { axes: string; promise: Promise<DecodedFilterAggregation>; controller: AbortController }>();

export function clearAggregationDecodeCache(): void {
  for (const entry of cache.values()) entry.controller.abort();
  cache.clear();
}

export function decodeFilterAggregation(data: FilterAggregation, axes: FilterAxis[]): Promise<DecodedFilterAggregation> {
  try {
    if (data.totalPlayGames !== undefined && (data.totalPlayGames !== true || data.schema !== "evlive-filter-aggregates/v2")) throw new Error("Invalid aggregation totalPlayGames");
    validateNormalCostSchedule(data.normalCostSchedule, data.medalsPerGame, data.schema);
  } catch (error) {
    return Promise.reject(error);
  }
  if (data.rows !== undefined) {
    return Promise.resolve().then(() => ({ ...data, rows: validateAggregateRows(data.rows, axes, undefined, data.axisMatchModes, data.schema, data.totalPlayGames) }));
  }
  const axisIdentity = JSON.stringify([data.schema, data.totalPlayGames, data.axisMatchModes, data.rowsAsset, axes.map(axis => [axis.key, axis.options.map(option => option.value)])]);
  const previous = cache.get(data);
  if (previous?.axes === axisIdentity) {
    cache.delete(data); cache.set(data, previous);
    return previous.promise;
  }
  previous?.controller.abort();
  const controller = new AbortController();
  const promise = (async () => {
    const gunzipText = async (encoded: string): Promise<string> => {
      if (typeof DecompressionStream === "undefined") throw new Error("Gzip decompression is unavailable");
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"), { signal: controller.signal });
      return new Response(stream).text();
    };
    let payload: FilterAggregationRowPayload | undefined;
    let rows: number[][] | undefined;
    if (data.rowsAsset) {
      // Revalidate so a temporary deployment 404 cannot remain cached on retry.
      const response = await fetch(aggregationAssetPath(data.rowsAsset), { signal: controller.signal, cache: "no-cache" });
      if (!response.ok) throw new Error("Aggregation asset is unavailable");
      const bytes = await response.arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const actual = [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("");
      if (controller.signal.aborted) throw new DOMException("Aggregation load aborted", "AbortError");
      if (actual === data.rowsAsset.sha256) {
        payload = validateAggregationAssetPayload(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), data.rowsAsset.rowCount);
      } else {
        // 2026-11-11：配信用に畳んだ中身は、ファイル名（畳む前の中身のハッシュ）と一致しない。
        // 畳んだ形（rowsPacked）のときだけ受け取り、行数と全行の検査は下でこれまでどおり行う。
        let value: unknown;
        try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { value = undefined; }
        const packed = packedAggregationAssetPayload(value, data.rowsAsset.rowCount);
        if (!packed) throw new Error("Aggregation asset checksum mismatch");
        rows = validateAggregateRows(unpackRows(JSON.parse(await gunzipText(packed.rowsPacked)), packed.rowCount),
          axes, packed.rowCount, data.axisMatchModes, data.schema, data.totalPlayGames);
      }
    } else {
      payload = { rowsGzip: data.rowsGzip, rowCount: data.rowCount };
    }
    if (rows === undefined && payload) {
      rows = payload.rows !== undefined
        ? validateAggregateRows(payload.rows, axes, data.rowsAsset?.rowCount, data.axisMatchModes, data.schema, data.totalPlayGames)
        : validateAggregateRows(JSON.parse(await gunzipText(payload.rowsGzip)), axes, payload.rowCount, data.axisMatchModes, data.schema, data.totalPlayGames);
    }
    if (rows === undefined) throw new Error("Aggregation rows are unavailable");
    const { rowsAsset: _asset, rowsGzip: _encoded, rowCount: _count, ...parameters } = data;
    return { ...parameters, rows };
  })();
  const entry = { axes: axisIdentity, promise, controller };
  cache.set(data, entry);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as FilterAggregation;
    cache.get(oldest)?.controller.abort();
    cache.delete(oldest);
  }
  void promise.catch(() => { if (cache.get(data) === entry) cache.delete(data); });
  return promise;
}

/** Cancel delivery after a profile/revision changes, even if native gzip is still completing. */
export function beginAggregationDecode(
  data: FilterAggregation,
  axes: FilterAxis[],
  onReady: (value: DecodedFilterAggregation) => void,
  onError: () => void,
  decode = decodeFilterAggregation
): () => void {
  let active = true;
  void decode(data, axes).then(value => { if (active) onReady(value); }, () => { if (active) onError(); });
  return () => { active = false; };
}
