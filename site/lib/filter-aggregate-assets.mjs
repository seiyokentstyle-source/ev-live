import { createHash } from 'node:crypto';

/** Keep the row payload out of HTML, RSC and live snapshots. Both the exporter
 * and the server boundary use exactly these bytes for content-addressed files. */
export function externalizeMachineAggregations(machine, onAsset = () => {}) {
  const externalize = (data) => {
    if (!data || data.rowsAsset) return data;
    const hasRows = Array.isArray(data.rows);
    const hasGzip = typeof data.rowsGzip === 'string';
    if (hasRows === hasGzip) throw new Error('Expected exactly one aggregate row payload');
    const rowCount = hasRows ? data.rows.length : data.rowCount;
    if (!Number.isSafeInteger(rowCount) || rowCount < 0) throw new Error('Invalid aggregate row count');
    const payload = hasRows ? { rows: data.rows } : { rowsGzip: data.rowsGzip, rowCount };
    const body = JSON.stringify(payload);
    const sha256 = createHash('sha256').update(body, 'utf8').digest('hex');
    onAsset(sha256, body);
    const { rows: _rows, rowsGzip: _gzip, rowCount: _count, ...parameters } = data;
    return { ...parameters, rowsAsset: { sha256, rowCount } };
  };
  const externalizeProfile = (profile) => {
    const filters = profile.evFilters;
    if (!filters) return profile;
    return { ...profile, evFilters: { ...filters,
      ...(filters.aggregation ? { aggregation: externalize(filters.aggregation) } : {}),
      ...(filters.tableAggregations ? { tableAggregations: Object.fromEntries(
        Object.entries(filters.tableAggregations).map(([key, data]) => [key, externalize(data)])) } : {}) } };
  };
  return { ...machine,
    profiles: machine.profiles.map(externalizeProfile),
    ...(machine.setting1Correction ? { setting1Correction: { ...machine.setting1Correction,
      profiles: machine.setting1Correction.profiles.map(externalizeProfile) } } : {})
  };
}
