import type { DecodedFilterAggregation, FilterAggregation, FilterAxis } from "./types";
import { validateAggregateRows } from "./filter-aggregation-validation";

// One active profile and one recently used profile. Never expand a whole machine.
const CACHE_LIMIT = 2;
const cache = new Map<FilterAggregation, { axes: string; promise: Promise<DecodedFilterAggregation>; controller: AbortController }>();

export function clearAggregationDecodeCache(): void {
  for (const entry of cache.values()) entry.controller.abort();
  cache.clear();
}

export function decodeFilterAggregation(data: FilterAggregation, axes: FilterAxis[]): Promise<DecodedFilterAggregation> {
  if (data.rows !== undefined) return Promise.resolve(data);
  const axisIdentity = JSON.stringify(axes.map(axis => [axis.key, axis.options.map(option => option.value)]));
  const previous = cache.get(data);
  if (previous?.axes === axisIdentity) {
    cache.delete(data); cache.set(data, previous);
    return previous.promise;
  }
  previous?.controller.abort();
  const controller = new AbortController();
  const promise = (async () => {
    if (typeof DecompressionStream === "undefined") throw new Error("Gzip decompression is unavailable");
    const binary = atob(data.rowsGzip);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"), { signal: controller.signal });
    const text = await new Response(stream).text();
    const rows = validateAggregateRows(JSON.parse(text), axes, data.rowCount);
    const { rowsGzip: _encoded, rowCount: _count, ...parameters } = data;
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
