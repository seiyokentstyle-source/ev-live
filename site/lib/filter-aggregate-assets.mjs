import { createHash } from 'node:crypto';

/** Keep the row payload out of HTML, RSC and live snapshots. Both the exporter
 * and the server boundary use exactly these bytes for content-addressed files. */
export function externalizeMachineAggregations(machine, onAsset = () => {}) {
  const externalizeProfile = (profile) => {
    const data = profile.evFilters?.aggregation;
    if (!data || data.rowsAsset) return profile;
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
    return { ...profile, evFilters: { ...profile.evFilters,
      aggregation: { ...parameters, rowsAsset: { sha256, rowCount } } } };
  };
  return { ...machine,
    profiles: machine.profiles.map(externalizeProfile),
    ...(machine.setting1Correction ? { setting1Correction: { ...machine.setting1Correction,
      profiles: machine.setting1Correction.profiles.map(externalizeProfile) } } : {})
  };
}
