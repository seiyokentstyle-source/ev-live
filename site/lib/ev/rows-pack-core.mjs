// 2026-11-11：絞り込みの集計行を、配信用に小さく畳む／元に戻す（サーバーの書き出しと画面の両方で使う）。
//
// 行は [開始G, 軸…, 件数n, 通常G, 獲得, (総G)]。同じ当たりが開始Gごとに1行ずつ並び、変わるのは
// 開始Gと、通常G（と総G）が「開始Gの差×n」ずつ減ることだけ。そこで「1つの組＝最初の行＋何番目の
// 開始Gから何行ぶん」として持つ。戻すと、元と同じ行が、同じ順番、同じ数値（1ビットも違わない）で並ぶ。
// 畳む側は戻した結果を元の行と突き合わせ、1つでも違えば畳まない（packRows が null を返す）。

const fail = (detail) => { throw new Error(`Invalid machine data: packed aggregation ${detail}`); };
const index = (value, maximum) => Number.isSafeInteger(value) && value >= 0 && value <= maximum;

/** rows を畳む。linear は開始Gに合わせて減る列、nColumn は件数の列。畳めないときは null。 */
export function packRows(rows, linear, nColumn) {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(rows[0])) return null;
  const width = rows[0].length;
  if (!index(nColumn, width - 1) || nColumn < 1 ||
    linear.some(column => !index(column, width - 1) || column < 1 || column === nColumn)) return null;
  const starts = [], startIndex = new Map();
  const blockOf = new Int32Array(rows.length);
  let previous = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length !== width || !row.every(Number.isFinite)) return null;
    let block = startIndex.get(row[0]);
    if (block === undefined) { block = starts.length; starts.push(row[0]); startIndex.set(row[0], block); }
    if (block < previous) return null; // 開始Gごとにまとまっていない
    previous = block; blockOf[i] = block;
  }
  const isLinear = new Array(width).fill(false);
  for (const column of linear) isLinear[column] = true;
  const fixed = [];
  for (let column = 1; column < width; column += 1) if (!isLinear[column]) fixed.push(column);
  // 組：最初の行、最初の開始Gの番号、行数。同じ固定列の組を candidates で引く。
  const groupRow = [], groupFirst = [], groupCount = [], open = new Map();
  const groupOfRow = new Int32Array(rows.length);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i], block = blockOf[i], g = row[0], n = row[nColumn];
    let key = '';
    for (const column of fixed) key += row[column] + ',';
    let candidates = open.get(key), found = -1;
    if (candidates) {
      for (let c = candidates.length - 1; c >= 0; c -= 1) {
        const group = candidates[c];
        if (groupFirst[group] + groupCount[group] !== block) continue;
        const firstRow = groupRow[group];
        let same = true;
        for (const column of linear) {
          if (firstRow[column] - (g - firstRow[0]) * n !== row[column]) { same = false; break; }
        }
        if (same) { found = group; break; }
      }
    } else { candidates = []; open.set(key, candidates); }
    if (found < 0) {
      found = groupRow.length;
      groupRow.push(row); groupFirst.push(block); groupCount.push(0);
      candidates.push(found);
    }
    groupCount[found] += 1;
    groupOfRow[i] = found;
  }
  // どの開始Gでも元の並びになる順番（隣り合う行の前後関係をすべて満たす順）を作る。
  const total = groupRow.length, next = new Array(total), indegree = new Int32Array(total);
  for (let i = 1; i < rows.length; i += 1) {
    if (blockOf[i] !== blockOf[i - 1]) continue;
    const before = groupOfRow[i - 1], after = groupOfRow[i];
    (next[before] ??= []).push(after); indegree[after] += 1;
  }
  const order = [], stack = [];
  for (let group = total - 1; group >= 0; group -= 1) if (indegree[group] === 0) stack.push(group);
  while (stack.length) {
    const group = stack.pop(); order.push(group);
    const list = next[group];
    if (list) for (let k = list.length - 1; k >= 0; k -= 1) if ((indegree[list[k]] -= 1) === 0) stack.push(list[k]);
  }
  if (order.length !== total) return null;
  const columns = [];
  for (let column = 1; column < width; column += 1) columns.push(order.map(group => groupRow[group][column]));
  const packed = { v: 1, width, n: nColumn, linear: [...linear], starts,
    first: order.map(group => groupFirst[group]), count: order.map(group => groupCount[group]), columns };
  // 戻した結果が元と完全に同じときだけ使う。
  let restored;
  try { restored = unpackRows(packed, rows.length); } catch { return null; }
  for (let i = 0; i < rows.length; i += 1) {
    const a = rows[i], b = restored[i];
    for (let column = 0; column < width; column += 1) if (!Object.is(a[column], b[column])) return null;
  }
  return packed;
}

/** 畳んだ行を元に戻す。形がおかしい入力は行を作る前に断る。 */
export function unpackRows(packed, expectedRows) {
  if (typeof packed !== 'object' || packed === null || Array.isArray(packed) || packed.v !== 1) fail('version is unsupported');
  const { width, n: nColumn, linear, starts, first, count, columns } = packed;
  if (!Number.isSafeInteger(width) || width < 4 || width > 64) fail('width is invalid');
  if (!index(nColumn, width - 1) || nColumn < 1) fail('count column is invalid');
  if (!Array.isArray(linear) || linear.some(column => !index(column, width - 1) || column < 1 || column === nColumn) ||
    new Set(linear).size !== linear.length) fail('linear columns are invalid');
  if (!Array.isArray(starts) || !starts.every(value => Number.isSafeInteger(value) && value >= 0) ||
    new Set(starts).size !== starts.length) fail('starts are invalid');
  if (!Array.isArray(first) || !Array.isArray(count) || first.length !== count.length) fail('groups are invalid');
  if (!Array.isArray(columns) || columns.length !== width - 1 ||
    columns.some(column => !Array.isArray(column) || column.length !== first.length || !column.every(Number.isFinite))) fail('columns are invalid');
  let total = 0;
  for (let group = 0; group < first.length; group += 1) {
    if (!index(first[group], starts.length - 1) || !Number.isSafeInteger(count[group]) || count[group] < 1 ||
      first[group] + count[group] > starts.length) fail('group range is invalid');
    total += count[group];
  }
  if (!Number.isSafeInteger(expectedRows) || total !== expectedRows) fail('row count is invalid');
  const isLinear = new Array(width).fill(false);
  for (const column of linear) isLinear[column] = true;
  // 開始Gごとに、その開始Gを含む組を保存順に出す。
  const change = new Int32Array(starts.length + 1);
  for (let group = 0; group < first.length; group += 1) { change[first[group]] += 1; change[first[group] + count[group]] -= 1; }
  const offsets = new Int32Array(starts.length);
  let active = 0, offset = 0;
  for (let block = 0; block < starts.length; block += 1) { active += change[block]; offsets[block] = offset; offset += active; }
  const rows = new Array(total);
  const counts = columns[nColumn - 1];
  for (let group = 0; group < first.length; group += 1) {
    const firstStart = starts[first[group]], n = counts[group];
    for (let block = first[group], end = first[group] + count[group]; block < end; block += 1) {
      const start = starts[block], row = new Array(width);
      row[0] = start;
      for (let column = 1; column < width; column += 1) {
        const value = columns[column - 1][group];
        row[column] = isLinear[column] ? value - (start - firstStart) * n : value;
      }
      rows[offsets[block]] = row; offsets[block] += 1;
    }
  }
  return rows;
}
