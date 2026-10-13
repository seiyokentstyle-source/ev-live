export function validateAggregateMatchModes(value, axes) {
  if (value === undefined) return axes.map(() => "single");
  if (!Array.isArray(value) || value.length !== axes.length ||
    value.some((mode, index) => (mode !== "single" && mode !== "bitmask") ||
      (mode === "bitmask" && axes[index].options.length > 30))) {
    throw new Error("Invalid machine data: aggregation axisMatchModes must match axes and bitmasks support at most 30 options");
  }
  return value;
}

/** Apply the same row contract to inline JSON and decompressed assets. */
export function validateAggregateRows(value, axes, expectedRows, axisMatchModes, schema = 'evlive-filter-aggregates/v1', totalPlayGames) {
  const fail = message => { throw new Error(`Invalid machine data: aggregation ${message}`); };
  if (!['evlive-filter-aggregates/v1', 'evlive-filter-aggregates/v2'].includes(schema)) fail('schema is unsupported');
  if (totalPlayGames !== undefined && (totalPlayGames !== true || schema !== 'evlive-filter-aggregates/v2')) fail('totalPlayGames requires v2 and true');
  if (!Array.isArray(value) || (expectedRows !== undefined && value.length !== expectedRows)) fail("row count is invalid");
  const modes = validateAggregateMatchModes(axisMatchModes, axes);
  const cells = new Set();
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== axes.length + (totalPlayGames ? 5 : 4) || !row.every(item => typeof item === "number" && Number.isFinite(item))) fail("row shape is invalid");
    if (!Number.isSafeInteger(row[0]) || row[0] < 0) fail("g is invalid");
    for (let index = 0; index < axes.length; index += 1) {
      const option = row[index + 1];
      const maximum = modes[index] === "bitmask" ? 2 ** axes[index].options.length - 1 : axes[index].options.length - 1;
      if (!Number.isSafeInteger(option) || option < -1 || option > maximum) fail("option index or bitmask is invalid");
    }
    const [n, normal, payout, play] = row.slice(axes.length + 1);
    // Payout is a signed medal change, including losses during recorded CZs.
    if (!Number.isSafeInteger(n) || n < 0 || normal < 0 || (n === 0 && (normal !== 0 || payout !== 0))) fail("totals are invalid");
    if (schema === 'evlive-filter-aggregates/v2' && n <= 0) fail('v2 sample count must be positive');
    if (totalPlayGames && (play < normal - 1e-8 || play < 0)) fail('totalPlayGames must include paid normal games');
    const keyParts = row.slice(0, axes.length + 1);
    if (schema === 'evlive-filter-aggregates/v2') keyParts.push(normal / n);
    const key = JSON.stringify(keyParts);
    if (cells.has(key)) fail("cells must be unique");
    cells.add(key);
  }
  return value;
}
