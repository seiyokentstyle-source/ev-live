import { describe, expect, it } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { validateMachine } from "../lib/ev/validate";

function machine() {
  return {
    ...structuredClone(fixture),
    settingAim: {
      label: "設定狙い", unit: "%", note: "100G以上・即やめ想定",
      dates: ["2026-09-01", "2026-09-11", "2026-09-20"],
      units: [{ unit: "650", avg: 100, days: 2, net: 300,
        rates: [110, null, 90], games: [100, 0, 200],
        dayDigitNets: { "1": { net: 400, days: 1 }, "2": { net: -100, days: 1 }, "0": { net: -100, days: 1 } }
      }]
    }
  };
}

describe("published setting-aim date-digit net validation", () => {
  it("preserves the optional aggregate through the public Machine validator", () => {
    const data = machine();
    expect(validateMachine(data).settingAim?.units[0].dayDigitNets).toEqual(data.settingAim.units[0].dayDigitNets);
  });

  it("accepts existing payloads with no date-digit net aggregate", () => {
    const data = machine();
    Reflect.deleteProperty(data.settingAim.units[0], "dayDigitNets");
    expect(validateMachine(data).settingAim?.units[0].net).toBe(300);
  });

  it.each([
    ["malformed map", null],
    ["array map", []],
    ["unknown digit", { "7x": { net: 1, days: 1 } }],
    ["unobserved digit", { "8": { net: 0, days: 1 } }],
    ["missing observed digit", { "1": { net: 400, days: 1 } }],
    ["wrong day count", { "1": { net: 400, days: 2 }, "2": { net: -100, days: 1 }, "0": { net: -100, days: 1 } }],
    ["non-finite net", { "1": { net: Number.NaN, days: 1 }, "2": { net: -100, days: 1 }, "0": { net: -100, days: 1 } }],
    ["fractional net", { "1": { net: 400.1, days: 1 }, "2": { net: -100, days: 1 }, "0": { net: -100, days: 1 } }],
    ["zero days", { "1": { net: 400, days: 0 }, "2": { net: -100, days: 1 }, "0": { net: -100, days: 1 } }],
  ])("rejects %s", (_name, invalid) => {
    const data = machine();
    Reflect.set(data.settingAim.units[0], "dayDigitNets", invalid);
    expect(() => validateMachine(data)).toThrow(/dayDigitNets/);
  });
});
