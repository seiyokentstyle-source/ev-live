import { describe, expect, test } from "vitest";
import { settingAimTotals } from "../lib/ev/setting-aim";

describe("setting aim footer follows the visible view", () => {
  // The second unit has no reading on the chosen specific day, but appears in
  // the day-summary view, whose columns include all specific days.
  const dateRows = [{ net: 1200, games: 3000 }];
  const dayRows = [{ net: 1200 }, { net: -400 }];

  test("day summary ignores the date view's hidden specific-day filter", () => {
    expect(settingAimTotals("day", dateRows, dayRows).net).toBe(800);
  });

  test("date view keeps the selected rows and their visible game totals", () => {
    expect(settingAimTotals("date", dateRows, dayRows)).toEqual({ net: 1200, games: 3000 });
  });

  test("day summary still counts units when the date filter matches no dates", () => {
    expect(settingAimTotals("day", [], dayRows).net).toBe(800);
  });

  test("an empty visible view has zero totals", () => {
    expect(settingAimTotals("day", dateRows, [])).toEqual({ net: 0, games: 0 });
  });
});
