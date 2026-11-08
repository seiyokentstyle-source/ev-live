import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Directory of content-addressed aggregate row files written by the scraper. */
export function sourceAggregatesDir(machinesDir) {
  return path.join(path.dirname(path.resolve(machinesDir)), 'filter-aggregates');
}

/**
 * The scraper may keep each table's filter rows in data/filter-aggregates/<sha256>.json
 * (the exact payload bytes the site itself would externalize). Restore them right after
 * reading a machine so validation, CZ cohort splitting and the build exporter see the
 * same inline rows as before. Machines that still carry inline rows pass through.
 */
export function inlineSourceAggregations(machine, aggregatesDir, options = {}) {
  if (!machine || typeof machine !== 'object' || !Array.isArray(machine.profiles)) return machine;
  // 2026-11-08：ページ生成では、行を読み込む必要があるのはCZスルー分割の表だけ。
  // ほかの表まで展開すると店舗混合で1GBを超えるため、profileKeys に合わない表は行を持たず、
  // サイトの書き出し（externalizeMachineAggregations）と同じ参照 { ...parameters, rowsAsset } にする。
  // 元ファイルの数値の書き方（141.0 など）はサイトの JSON.stringify と違うことがあるので、
  // 参照の sha256 は元ファイルのものではなく、書き出し側と同じバイト列から計算し直す。
  const wanted = options.profileKeys;
  const inline = (data, profileKey, referenceOnly = false) => {
    if (!data || data.rowsAsset === undefined) return data;
    const { rowsAsset, ...parameters } = data;
    const sha256 = rowsAsset?.sha256, rowCount = rowsAsset?.rowCount;
    if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256) ||
        !Number.isSafeInteger(rowCount) || rowCount < 0) {
      throw new Error(`Invalid source aggregate reference in profile ${profileKey}`);
    }
    let body;
    try {
      body = readFileSync(path.join(aggregatesDir, `${sha256}.json`), 'utf8');
    } catch {
      throw new Error(`Source aggregates must contain their row payload: missing file ${sha256}`);
    }
    if (createHash('sha256').update(body, 'utf8').digest('hex') !== sha256) {
      throw new Error(`Source aggregate ${sha256} does not match its content hash`);
    }
    const payload = JSON.parse(body);
    let rows;
    if (Array.isArray(payload.rows) && payload.rowsGzip === undefined) {
      if (payload.rows.length !== rowCount) throw new Error(`Source aggregate ${sha256} row count mismatch`);
      rows = { rows: payload.rows };
    } else if (typeof payload.rowsGzip === 'string' && payload.rows === undefined && payload.rowCount === rowCount) {
      rows = { rowsGzip: payload.rowsGzip, rowCount };
    } else {
      throw new Error(`Source aggregate ${sha256} has an invalid payload`);
    }
    if (referenceOnly) {
      const sha = createHash('sha256').update(JSON.stringify(rows), 'utf8').digest('hex');
      return { ...parameters, rowsAsset: { sha256: sha, rowCount } };
    }
    return { ...parameters, ...rows };
  };
  const inlineProfile = (profile) => {
    const filters = profile?.evFilters;
    if (!filters) return profile;
    const referenceOnly = Boolean(wanted) && !wanted.test(String(profile.key));
    return { ...profile, evFilters: { ...filters,
      ...(filters.aggregation ? { aggregation: inline(filters.aggregation, profile.key, referenceOnly) } : {}),
      ...(filters.tableAggregations ? { tableAggregations: Object.fromEntries(
        Object.entries(filters.tableAggregations).map(([key, data]) => [key, inline(data, `${profile.key}/${key}`, referenceOnly)])) } : {}) } };
  };
  return { ...machine,
    profiles: machine.profiles.map(inlineProfile),
    ...(machine.setting1Correction && Array.isArray(machine.setting1Correction.profiles)
      ? { setting1Correction: { ...machine.setting1Correction,
        profiles: machine.setting1Correction.profiles.map(inlineProfile) } } : {})
  };
}
