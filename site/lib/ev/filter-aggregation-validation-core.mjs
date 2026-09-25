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
export function validateAggregateRows(value, axes, expectedRows, axisMatchModes) {
  const fail = message => { throw new Error(`Invalid machine data: aggregation ${message}`); };
  if (!Array.isArray(value) || (expectedRows !== undefined && value.length !== expectedRows)) fail("row count is invalid");
  const modes = validateAggregateMatchModes(axisMatchModes, axes);
  const cells = new Set();
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== axes.length + 4 || !row.every(item => typeof item === "number" && Number.isFinite(item))) fail("row shape is invalid");
    if (!Number.isSafeInteger(row[0]) || row[0] < 0) fail("g is invalid");
    for (let index = 0; index < axes.length; index += 1) {
      const option = row[index + 1];
      const maximum = modes[index] === "bitmask" ? 2 ** axes[index].options.length - 1 : axes[index].options.length - 1;
      if (!Number.isSafeInteger(option) || option < -1 || option > maximum) fail("option index or bitmask is invalid");
    }
    const [n, normal, payout] = row.slice(axes.length + 1);
    // Payout is a signed medal change, including losses during recorded CZs.
    if (!Number.isSafeInteger(n) || n < 0 || normal < 0 || (n === 0 && (normal !== 0 || payout !== 0))) fail("totals are invalid");
    const key = JSON.stringify(row.slice(0, axes.length + 1));
    if (cells.has(key)) fail("cells must be unique");
    cells.add(key);
  }
  return value;
}
