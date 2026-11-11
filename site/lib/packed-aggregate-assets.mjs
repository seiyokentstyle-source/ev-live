import { gunzipSync, gzipSync } from 'node:zlib';
import { packRows } from './ev/rows-pack-core.mjs';

// 小さい表は畳んでも得をしないので、そのまま出す。
const MINIMUM_ROWS = 1000;

/**
 * 2026-11-11：配信するファイルの中身だけを小さくする。ファイル名（参照の sha256）は、畳む前の
 * 中身のハッシュのまま（ページ生成は行を展開せずにこの名前を計算しているため変えない）。
 * 畳めない・小さくならないときは、これまでと同じ中身を返す。
 */
export function packAggregateAssetBody(body, layout) {
  const payload = JSON.parse(body);
  if (typeof payload.rowsGzip !== 'string' || !Number.isSafeInteger(payload.rowCount) || payload.rowCount < MINIMUM_ROWS ||
    !layout || !Number.isSafeInteger(layout.axisCount) || layout.axisCount < 0) return body;
  const rows = JSON.parse(gunzipSync(Buffer.from(payload.rowsGzip, 'base64'), { maxOutputLength: 1024 * 1024 * 1024 }).toString('utf8'));
  if (!Array.isArray(rows) || rows.length !== payload.rowCount) return body;
  const nColumn = layout.axisCount + 1;
  const linear = layout.totalPlayGames ? [nColumn + 1, nColumn + 3] : [nColumn + 1];
  const packed = packRows(rows, linear, nColumn);
  if (!packed) return body;
  const next = JSON.stringify({ rowsPacked: gzipSync(JSON.stringify(packed), { level: 9 }).toString('base64'), rowCount: payload.rowCount });
  return next.length < body.length ? next : body;
}
