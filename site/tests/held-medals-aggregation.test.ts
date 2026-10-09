import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { aggregateFilterTable, roundAggregateEV } from "../lib/ev/filter-aggregation";
import { validateAggregateRows } from "../lib/ev/filter-aggregation-validation";
import { decodeFilterAggregation } from "../lib/ev/aggregation-decode";
import { applyHeldMedalTableEV, compatibleFilterSelection, selectedFilterTable } from "../lib/ev/profiles";
import { validateMachine } from "../lib/ev/validate";
import { generateRows } from "../lib/ev/calc";
import type { DecodedFilterAggregation, EvFilterTable, FilterAggregation, FilterAxis, Profile } from "../lib/ev/types";

const axes: FilterAxis[] = [{ key: "c", label: "スルー回数", allLabel: "不問",
  options: [{ value: "0", label: "0" }, { value: "1", label: "1" }] }];
const loan = 1000 / 46, credit = 1000 / 52;
const data: DecodedFilterAggregation = {
  schema: "evlive-filter-aggregates/v2", axisKeys: ["c"], costPerGame: loan,
  exchange: credit, medalsPerGame: 1, junzou: 4, bet: 3, investmentMinimum: "mean", roundingEpsilon: 1e-8,
  rows: [[0, 0, 1, 0, 0], [0, 0, 1, 100, 250], [0, 0, 2, 600, 700],
    [0, 1, 1, 50, 100], [0, -1, 1, 90, -20]],
};
const profileWith = (aggregation: FilterAggregation): Profile => ({
  key: "at_4652", label: "AT間・46/52", ceiling: "100G", gRange: { start: 0, end: 100, step: 10 },
  activeAxes: [], baseAnchors: [{ g: 0, ev: 100, rtp: 101 }], zones: [],
  evFilters: { axes, tables: {}, aggregation },
});
const machineWith = (aggregation: FilterAggregation) => ({ ...fixture, setting1Correction: undefined, profiles: [profileWith(aggregation)] });
const packed = (aggregation: DecodedFilterAggregation): FilterAggregation => {
  const { rows, ...rest } = aggregation;
  return { ...rest, rowsGzip: gzipSync(JSON.stringify(rows)).toString("base64"), rowCount: rows.length };
};

describe("exact v2 held-medal aggregation", () => {
  it("caps each homogeneous investment before combining counts and totals", () => {
    const row = aggregateFilterTable(data, axes, { c: "0" }, 0, 150).baseAnchors[0];
    const profit = 950 * credit - 700 * loan + (0 + 100 + 2 * 150) * (loan - credit);
    expect(row.n).toBe(4);
    expect(row.ev).toBe(roundAggregateEV(profit / 4));
    expect(row.inv).toBe(175);
    expect(row.playG).toBe((700 + 950 / 4) / 4);
    expect(row.rtp).toBeCloseTo(100 + profit / (20 * 3 * (700 + 950 / 4)) * 100, 10);
    expect(row.ev).not.toBe(roundAggregateEV((950 * credit - 700 * loan) / 4 + Math.min(150, 175) * (loan - credit)));
  });

  it("keeps zero-holding results identical to the corresponding old aggregate", () => {
    const legacy: DecodedFilterAggregation = { ...data, schema: "evlive-filter-aggregates/v1",
      rows: [[0, 0, 4, 700, 950], [0, 1, 1, 50, 100], [0, -1, 1, 90, -20]] };
    for (const selection of [{}, { c: "0" }, { c: "0|1" }]) {
      expect(aggregateFilterTable(data, axes, selection, 0, 0)).toEqual(aggregateFilterTable(legacy, axes, selection, 0));
    }
    expect(() => aggregateFilterTable(legacy, axes, {}, 0, 1)).toThrow(/exact v2/);
  });

  it("leaves equal-exchange EV unchanged for every holding size", () => {
    const equal = { ...data, costPerGame: 20, exchange: 20 };
    for (const holding of [0, 50, 150, 100_000]) {
      expect(aggregateFilterTable(equal, axes, {}, 0, holding)).toEqual(aggregateFilterTable(equal, axes, {}, 0));
    }
  });

  it("saturates when every investment is covered and does not add the starting balance", () => {
    const full = aggregateFilterTable(data, axes, { c: "0" }, 0, 300);
    expect(full).toEqual(aggregateFilterTable(data, axes, { c: "0" }, 0, 10_000));
    expect(full.baseAnchors[0].ev).toBe(roundAggregateEV((950 - 700) * credit / 4));
  });

  it("matches cash spent plus ending assets less the original holding's value", () => {
    const holding = 150;
    const investments = [0, 100, 300, 300], payouts = [0, 250, 350, 350];
    const expectedProfit = investments.reduce((sum, investment, i) => {
      const used = Math.min(holding, investment);
      const endingAssets = (payouts[i] + holding - used) * credit;
      const cashSpent = (investment - used) * loan;
      return sum + endingAssets - cashSpent - holding * credit;
    }, 0) / investments.length;
    expect(aggregateFilterTable(data, axes, { c: "0" }, 0, holding).baseAnchors[0].ev)
      .toBe(roundAggregateEV(expectedProfit));
  });

  it("retains fractional investment and rounds the adjusted full profit only once", () => {
    const fractional: DecodedFilterAggregation = { ...data, medalsPerGame: 1.53,
      costPerGame: 1.53 * loan, rows: [[0, 0, 2, 2, 0.03], [0, 0, 1, 2, 0.02]] };
    const held = 2;
    const profit = 0.05 * credit - 4 * 1.53 * loan + (1.53 * 2 + 2) * (loan - credit);
    expect(aggregateFilterTable(fractional, axes, {}, 0, held).baseAnchors[0].ev).toBe(roundAggregateEV(profit / 3));
    const doubleRound: DecodedFilterAggregation = { ...data, costPerGame: 2, exchange: 1,
      rows: [[0, 0, 1, 0.2, 0], [0, 0, 1, 1, 1.8]] };
    // Baseline -0.3 rounds to 0; benefit 0.6 must produce round(0.3)=0, not round(0+0.6)=1.
    expect(aggregateFilterTable(doubleRound, axes, {}, 0, 1).baseAnchors[0].ev).toBe(0);
  });

  it("feeds one adjusted EV into the production hourly and RTP calculation", () => {
    const table = aggregateFilterTable(data, axes, { c: "0" }, 0, 150);
    const profile = { ...profileWith(data), baseAnchors: table.baseAnchors,
      gRange: { start: table.start, end: table.end, step: 10 } };
    const machine = validateMachine({ ...machineWith(data), profiles: [profile] });
    const row = generateRows(profile, machine, {})[0];
    const games = table.baseAnchors[0].playG!;
    expect(row.ev).toBe(table.baseAnchors[0].ev);
    expect(row.hourly).toBe(Math.round(row.ev * machine.economics.gamesPerHour / games));
    expect(row.rtp).toBeCloseTo(100 + row.ev / (20 * (machine.evCalc?.bet || 3) * games) * 100, 10);
    expect(row.medals).toBe(175);
  });

  it("honors filters, multi-selection and unknown axes before applying holdings", () => {
    const all = aggregateFilterTable(data, axes, {}, 0, 150).baseAnchors[0];
    const known = aggregateFilterTable(data, axes, { c: "0|1" }, 0, 150).baseAnchors[0];
    expect(all.n).toBe(6);
    expect(known.n).toBe(5);
    const profit = 1050 * credit - 750 * loan + (100 + 300 + 50) * (loan - credit);
    expect(known.ev).toBe(roundAggregateEV(profit / 5));
  });

  it("counts a matching bitmask cell once when multiple selected values overlap", () => {
    const mask: DecodedFilterAggregation = { ...data, axisMatchModes: ["bitmask"],
      rows: [[0, 3, 2, 200, 500], [0, 1, 1, 300, 200]] };
    expect(aggregateFilterTable(mask, axes, { c: "0|1" }, 0, 150))
      .toEqual(aggregateFilterTable(mask, axes, {}, 0, 150));
    expect(aggregateFilterTable(mask, axes, { c: "0|1" }, 0, 150).hits).toBe(3);
  });

  it("preserves payout correction, investment and session duration", () => {
    const corrected = { ...data, rows: data.rows.map(row => row.map((value, index) => index === 4 ? value * .8 : value)) };
    const source = structuredClone(corrected);
    const cash = aggregateFilterTable(corrected, axes, {}, 0).baseAnchors[0];
    const held = aggregateFilterTable(corrected, axes, {}, 0, 150).baseAnchors[0];
    expect(held.n).toBe(cash.n);
    expect(held.inv).toBe(cash.inv);
    expect(held.playG).toBe(cash.playG);
    expect(corrected).toEqual(source);
  });

  it.each([-1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid holdings %s", holding => {
    expect(() => aggregateFilterTable(data, axes, {}, 0, holding)).toThrow(/Held medals/);
  });
});

describe("v2 contract and profile integration", () => {
  it("accepts repeated g/axis combinations only when the exact investment differs", () => {
    expect(validateMachine(machineWith(data)).profiles[0].evFilters?.aggregation).toEqual(data);
    expect(() => validateMachine(machineWith({ ...data, schema: "evlive-filter-aggregates/v1" }))).toThrow(/unique/);
    const duplicate = { ...data, rows: [...data.rows, [0, 0, 2, 200, 900]] };
    expect(() => validateMachine(machineWith(duplicate))).toThrow(/unique/);
  });

  it("requires positive v2 sample counts, retaining the v1 zero-cell rule", () => {
    const rows = [[0, 0, 0, 0, 0]];
    expect(validateAggregateRows(rows, axes)).toEqual(rows);
    expect(() => validateAggregateRows(rows, axes, 1, undefined, data.schema)).toThrow(/positive/);
  });

  it("rejects unrecognized schemas, additional payload fields and malformed rows", () => {
    expect(() => validateMachine(machineWith({ ...data, schema: "evlive-filter-aggregates/v3" } as unknown as FilterAggregation))).toThrow(/schema/);
    expect(() => validateMachine(machineWith({ ...data, histories: [] } as FilterAggregation))).toThrow(/fields/);
    expect(() => validateAggregateRows([[0, 0, 1, 100, 200, 300]], axes, 1, undefined, data.schema)).toThrow(/shape/);
  });

  it("decodes compressed v2 rows under their v2 uniqueness contract", async () => {
    const compressed = packed(data);
    expect(validateMachine(machineWith(compressed)).profiles[0].evFilters?.aggregation).toEqual(compressed);
    const decoded = await decodeFilterAggregation(compressed, axes);
    expect(decoded).toEqual(data);
    expect(selectedFilterTable(profileWith(compressed), axes, {}, decoded, 150))
      .toEqual(aggregateFilterTable(data, axes, {}, 0, 150));
    const duplicate = packed({ ...data, rows: [...data.rows, [0, 0, 2, 200, 900]] });
    await expect(decodeFilterAggregation(duplicate, axes)).rejects.toThrow(/unique/);
  });

  it("applies the same strict distribution validation to direct inline decoding", async () => {
    expect(await decodeFilterAggregation(data, axes)).toEqual(data);
    await expect(decodeFilterAggregation({ ...data, rows: [...data.rows, [0, 0, 2, 200, 900]] }, axes)).rejects.toThrow(/unique/);
  });

  it("uses the original profile for unrestricted zero-holding tables only", () => {
    const profile = profileWith(data);
    expect(selectedFilterTable(profile, axes, {}, undefined, 0)).toBeUndefined();
    expect(selectedFilterTable(profile, axes, {}, undefined, 150))
      .toEqual(aggregateFilterTable(data, axes, {}, 0, 150));
    expect(selectedFilterTable(profile, axes, { c: "0" }, undefined, 150))
      .toEqual(aggregateFilterTable(data, axes, { c: "0" }, 0, 150));
  });

  it("never silently approximates from old or unavailable aggregate data", () => {
    const old = { ...data, schema: "evlive-filter-aggregates/v1" as const, rows: [[0, 0, 4, 700, 950]] };
    expect(() => selectedFilterTable(profileWith(old), axes, {}, undefined, 150)).toThrow(/exact v2/);
    expect(selectedFilterTable(profileWith(packed(data)), axes, {}, undefined, 150)).toBeUndefined();
    expect(selectedFilterTable(profileWith(data), axes, { missing: "0" }, undefined, 150)).toBeUndefined();
  });
});

describe("published table continuity when holdings change", () => {
  const source: Profile = { ...profileWith(data), gRange: { start: 0, end: 10, step: 10 },
    baseAnchors: [{ g: 0, ev: -664, rtp: 97.2, n: 100, inv: 201, playG: 400 },
      { g: 10, ev: -600, rtp: 97.3, n: 95, inv: 190, playG: 389 }],
    zones: [{ g: 10, label: "既存ゾーン" }], totalPayout: 12_345, firstHitRate: 178,
    sessions: 100, sampleNote: "既存母集団", sessionUnit: "AT間" };
  const adjusted = [
    { g: 0, ev: -662, rtp: 97.25, n: 100, inv: 200.8, playG: 400.4 },
    { g: 10, ev: -598, rtp: 97.35, n: 95, inv: 189.6, playG: 388.8 },
    { g: 20, ev: -400, rtp: 98.2, n: 1, inv: 100.5, playG: 300.2 },
  ];

  it("never reveals extra G rows or replaces published investment and duration rounding", () => {
    const original = structuredClone(source);
    const result = applyHeldMedalTableEV(source, adjusted)!;
    expect(result).toEqual({ ...source, baseAnchors: source.baseAnchors.map((row, index) => ({ ...row, ev: adjusted[index].ev })) });
    expect(result.gRange).toEqual({ start: 0, end: 10, step: 10 });
    expect(result.baseAnchors.map(row => row.g)).toEqual([0, 10]);
    expect(source).toEqual(original);
    const machine = validateMachine({ ...machineWith(data), profiles: [result] });
    const rows = generateRows(result, machine, {});
    expect(rows.map(row => row.g)).toEqual([0, 10]);
    expect(rows[0].hourly).toBe(Math.round(-662 * machine.economics.gamesPerHour / 400));
    expect(rows[0].medals).toBe(201);
  });

  it("fails closed when any published G has no matching adjusted value", () => {
    expect(applyHeldMedalTableEV(source, adjusted.filter(row => row.g !== 10))).toBeUndefined();
  });

  it("preserves an already-corrected profile and changes EV alone", () => {
    const corrected = { ...source, key: "at_s1_4652", label: "設定1補正",
      baseAnchors: source.baseAnchors.map(row => ({ ...row, ev: row.ev - 2_000, playG: row.playG! - 50 })),
      totalPayout: 9_876, pendingReason: undefined };
    const correctedHeld = adjusted.map(row => ({ ...row, ev: row.ev - 2_000 }));
    const result = applyHeldMedalTableEV(corrected, correctedHeld)!;
    expect(result).toEqual({ ...corrected, baseAnchors: corrected.baseAnchors.map((row, index) => ({ ...row, ev: correctedHeld[index].ev })) });
    expect(result.totalPayout).toBe(9_876);
    expect(result.baseAnchors[0].playG).toBe(350);
  });

  it("retains all five fixed heaven bands and their published metadata", () => {
    const heavenAxes: FilterAxis[] = [{ key: "h", label: "前回ハマりG", allLabel: "不問",
      options: ["0", "200", "400", "600", "800"].map(value => ({ value, label: `${value}G帯` })) }];
    const tables: Record<string, EvFilterTable> = {};
    const rows: number[][] = [];
    for (const [index, option] of heavenAxes[0].options.entries()) {
      tables[`h${option.value}`] = { baseAnchors: structuredClone(source.baseAnchors), start: 0, end: 10,
        totalPayout: 1_000 + index, firstHitRate: 170 + index, units: 20 + index, hits: 100 + index };
      for (const g of [0, 10, 20]) rows.push([g, index, 100, (400.4 - g) * 100, 80_000]);
    }
    const aggregate: DecodedFilterAggregation = { ...data, axisKeys: ["h"], rows };
    const profile: Profile = { ...source, key: "heaven_4652",
      evFilters: { axes: heavenAxes, tables, aggregation: aggregate } };
    const original = structuredClone(profile);
    for (const option of heavenAxes[0].options) {
      const selection = { h: option.value }, originalTable = tables[`h${option.value}`];
      expect(selectedFilterTable(profile, heavenAxes, selection, undefined, 0)).toBe(originalTable);
      const held = selectedFilterTable(profile, heavenAxes, selection, undefined, 1)!;
      const expected = aggregateFilterTable(aggregate, heavenAxes, selection, 0, 1);
      expect(held).toEqual({ ...originalTable, baseAnchors: originalTable.baseAnchors.map((row, index) => ({ ...row, ev: expected.baseAnchors[index].ev })) });
      expect(held.baseAnchors.map(row => row.g)).toEqual([0, 10]);
    }
    expect(profile.evFilters!.axes![0].options).toHaveLength(5);
    expect(profile).toEqual(original);
  });

  it("clears multi-selection carried into a single-band heaven axis", () => {
    const profile: Profile = { ...profileWith(data), key: "heaven_4652" };
    expect(compatibleFilterSelection(profile, { c: "0|1" })).toEqual({});
    expect(compatibleFilterSelection(profile, { c: "0|unavailable" })).toEqual({});
    expect(compatibleFilterSelection(profile, { c: "1" })).toEqual({ c: "1" });
    expect(compatibleFilterSelection(profile, { c: "1|1" })).toEqual({ c: "1" });
    expect(compatibleFilterSelection(profileWith(data), { c: "0|1" })).toEqual({ c: "0|1" });
  });

  it.each([0, 150])("rejects a direct heaven multi-selection at %s held medals", held => {
    const profile: Profile = { ...profileWith(data), key: "heaven_4652" };
    expect(selectedFilterTable(profile, axes, { c: "0|1" }, undefined, held)).toBeUndefined();
    expect(selectedFilterTable(profileWith(data), axes, { c: "0|1" }, undefined, held)?.hits).toBe(5);
  });
});
