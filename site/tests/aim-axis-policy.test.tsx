import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fixture from "../app/preview/ev-table/machine.json";
import { EvFilter } from "../components/ev/EvFilter";
import { ProfileBar } from "../components/ev/ProfileBar";
import { aimTabs, savedTargetAimKey, savedTargetIdFromAim } from "../lib/ev/aim-selection";
import { compatibleFilterSelection, declaredFilterAxes, filterSelectionKey, groupProfiles, isExactFilterTableKey, selectedFilterTable } from "../lib/ev/profiles";
import { validateMachine } from "../lib/ev/validate";
import type { AimKind, EvFilterTable, FilterAxis, Profile } from "../lib/ev/types";

const axes: FilterAxis[] = [
  { key: "c", label: "CZスルー回数", allLabel: "指定なし", options: [{ value: "0", label: "0スルー" }, { value: "1", label: "1スルー" }] },
  { key: "p", label: "前回CZまでのハマりG数", allLabel: "全部", options: [{ value: "100", label: "100G以上" }] }
];
const table: EvFilterTable = {
  start: 1, end: 100, totalPayout: 1000, firstHitRate: 100, units: 1, hits: 1,
  baseAnchors: [{ g: 1, ev: -10, rtp: 99, n: 1, inv: 100, playG: 100 }, { g: 100, ev: 10, rtp: 101, n: 1, inv: 1, playG: 2 }]
};
function profile(aimKind?: AimKind, key = "normal_4652"): Profile {
  return { key, aimKind, label: "AT間・駆け抜け後（短縮天井100G）・46/52", ceiling: "短縮天井100G",
    gRange: { start: 1, end: 100, step: 10 }, activeAxes: [], baseAnchors: table.baseAnchors, zones: [],
    evFilters: { tails: ["7"], days: ["7"], cz: ["0"], axes, tables: { c1p100: table },
      selectionPolicy: { schema: "test-policy/v1", startG: 1, threshold: 1 } } };
}
function machineWith(value: Profile) { return { ...fixture, profiles: [value], setting1Correction: undefined }; }

describe("explicit aim categories", () => {
  it("orders the four categories without inventing a category for old profiles", () => {
    const { groups } = groupProfiles([
      profile(undefined, "legacy_4652"), profile("at_runthrough", "short_4652"),
      profile("bonus", "bonus_4652"), profile("at_non_runthrough", "at_4652"), profile("cz", "cz_4652")
    ]);
    expect(groups.map(group => group.aimKind)).toEqual(["cz", "bonus", "at_non_runthrough", "at_runthrough", undefined]);
    expect(groups.at(-1)?.key).toBe("legacy");
  });
  it("keeps generated short-ceiling labels and groups rate pairs by the original key", () => {
    const value = profile("at_runthrough", "short_4652");
    const second = { ...value, key: "short_5050", label: value.label.replace("46/52", "50/50") };
    const { groups } = groupProfiles([value, second]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "short", label: "AT間・駆け抜け後（短縮天井100G）", ceiling: "短縮天井100G" });
    expect(Object.keys(groups[0].variants)).toEqual(["4652", "5050"]);
  });
  it("does not override new generated ceiling metadata with a legacy machine exception", () => {
    const value = { ...profile("cz", "cz_reset_4652"), ceiling: "生成側で確認した天井" };
    expect(groupProfiles([value], "vvv2").groups[0].ceiling).toBe(value.ceiling);
  });
});

describe("short-ceiling runthrough aim replacement", () => {
  function splitProfiles(): Profile[] {
    return ["4652", "5050"].flatMap(rate => {
      const variant = (key: string, sessions: number, aimKind?: AimKind, ceiling = 1000): Profile => ({
        ...profile(aimKind, `${key}_${rate}`), sessions,
        label: `${key}・${rate === "4652" ? "46/52" : "50/50"}`,
        ceiling: `${ceiling}G`, gRange: { start: 1, end: ceiling, step: 10 },
        baseAnchors: [{ ...table.baseAnchors[0] }, { ...table.baseAnchors[1], g: ceiling }]
      });
      return [
        variant("game_ceiling", 100),
        variant("game_ceiling_joui", 20, undefined, 600),
        variant("game_ceiling_after_nonrunthrough", 60, "at_non_runthrough"),
        variant("game_ceiling_after_nonrunthrough_joui", 20, "at_non_runthrough", 600),
        variant("game_ceiling_after_runthrough", 40, "at_runthrough", 600)
      ];
    });
  }
  const keys = (values: Profile[]) => groupProfiles(values).groups.map(group => group.key);

  it("replaces complete rate pairs with disjoint aims and retains each generated ceiling and data", () => {
    const values = splitProfiles();
    const before = structuredClone(values);
    const result = groupProfiles(values);
    expect(result.groups.map(group => group.key)).toEqual([
      "game_ceiling_after_nonrunthrough", "game_ceiling_after_nonrunthrough_joui", "game_ceiling_after_runthrough"
    ]);
    expect(result.rates.map(rate => rate.value)).toEqual(["4652", "5050"]);
    expect(result.defaultRate).toBe("4652");
    for (const group of result.groups) {
      const ceiling = group.key === "game_ceiling_after_nonrunthrough" ? 1000 : 600;
      expect(group.ceiling).toBe(`${ceiling}G`);
      expect(Object.keys(group.variants)).toEqual(["4652", "5050"]);
      for (const rate of ["4652", "5050"]) {
        const source = values.find(value => value.key === `${group.key}_${rate}`)!;
        expect(group.variants[rate]).toBe(source);
        expect(source.gRange.end).toBe(ceiling);
        expect(source.baseAnchors.at(-1)?.g).toBe(ceiling);
      }
    }
    expect(values).toEqual(before);
  });

  it("preserves reset, intermediate and setting-1 profiles instead of replacing corrected values with observed values", () => {
    const untouched = ["reset", "cz_ceiling", "game_ceiling_s1", "game_ceiling_prev_rb"]
      .map(key => ({ ...profile(undefined, `${key}_4652`), sessions: 100 }));
    const result = groupProfiles([...splitProfiles(), ...untouched]);
    for (const source of untouched) {
      expect(result.groups.find(group => group.key === source.key.replace(/_4652$/, ""))?.variants["4652"])
        .toBe(source);
    }
  });

  it.each(["game_ceiling_after_nonrunthrough", "game_ceiling_after_runthrough"])(
    "keeps the mixed table when %s is absent", missing => {
      const values = splitProfiles().filter(value => ![`${missing}_4652`, `${missing}_5050`].includes(value.key));
      expect(keys(values)).toContain("game_ceiling");
    }
  );

  it.each(["game_ceiling_after_nonrunthrough", "game_ceiling_after_runthrough", "game_ceiling_after_nonrunthrough_joui"])(
    "keeps the legacy rate pair when %s has only one exchange rate", incomplete => {
      const values = splitProfiles().filter(value => value.key !== `${incomplete}_5050`);
      expect(keys(values)).toContain(incomplete.endsWith("_joui") ? "game_ceiling_joui" : "game_ceiling");
    }
  );

  it("keeps the mixed table if known cohorts leave even one unknown session", () => {
    const values = splitProfiles();
    values.find(value => value.key === "game_ceiling_after_runthrough_5050")!.sessions = 39;
    expect(keys(values)).toContain("game_ceiling");
  });

  it.each(["game_ceiling", "game_ceiling_after_nonrunthrough", "game_ceiling_after_runthrough"])(
    "does not infer missing counts for %s", missing => {
      const values = splitProfiles();
      delete values.find(value => value.key === `${missing}_5050`)!.sessions;
      expect(keys(values)).toContain("game_ceiling");
    }
  );

  it.each([
    { normal: 101, after: -1 },
    { normal: 99.5, after: 0.5 },
    { normal: 60, after: Number.NaN },
    { normal: 60, after: Number.POSITIVE_INFINITY }
  ])("requires finite nonnegative integer cohort counts: %j", counts => {
    const values = splitProfiles();
    values.find(value => value.key === "game_ceiling_after_nonrunthrough_5050")!.sessions = counts.normal;
    values.find(value => value.key === "game_ceiling_after_runthrough_5050")!.sessions = counts.after;
    expect(keys(values)).toContain("game_ceiling");
  });

  it.each(["game_ceiling_after_nonrunthrough", "game_ceiling_after_runthrough"])(
    "requires the declared aim category on every rate of %s", untyped => {
      const values = splitProfiles();
      delete values.find(value => value.key === `${untyped}_5050`)!.aimKind;
      expect(keys(values)).toContain("game_ceiling");
    }
  );

  it.each(["pending-without-reason", "pending-reason", "empty-anchors"])(
    "keeps a usable mixed table when the split has %s", incomplete => {
      const values = splitProfiles();
      const after = values.find(value => value.key === "game_ceiling_after_runthrough_5050")!;
      if (incomplete === "pending-without-reason") after.dataPending = true;
      else if (incomplete === "pending-reason") after.pendingReason = "検証中";
      else after.baseAnchors = [];
      expect(keys(values)).toContain("game_ceiling");
    }
  );

  it.each(["different-count", "unknown-count", "wrong-category"])(
    "retains the upper-AT table independently when its replacement has %s", mismatch => {
      const values = splitProfiles();
      const upper = values.find(value => value.key === "game_ceiling_after_nonrunthrough_joui_5050")!;
      if (mismatch === "different-count") upper.sessions = 19;
      else if (mismatch === "unknown-count") delete upper.sessions;
      else upper.aimKind = "at_runthrough";
      expect(keys(values)).toContain("game_ceiling_joui");
      expect(keys(values)).not.toContain("game_ceiling");
    }
  );

  it("leaves machines without a declared split unchanged", () => {
    const values = splitProfiles().filter(value => !value.aimKind);
    expect(keys(values)).toEqual(["game_ceiling", "game_ceiling_joui"]);
  });

  it("shows Kabaneri's four ST aftermath aims in order without changing either rate's data", () => {
    const additions = ["4652", "5050"].flatMap(rate =>
      ["reset", "cz_ceiling", "cz_reset", "cz_s1"].map(key => ({
        ...profile(key === "cz_ceiling" ? "bonus" : undefined, `${key}_${rate}`), sessions: 10
      })));
    const values = [...splitProfiles(), ...additions];
    const before = structuredClone(values);
    const result = groupProfiles(values, "mcd43a818");
    expect(result.groups.map(group => [group.key, group.label])).toEqual([
      ["game_ceiling_after_nonrunthrough", "駆け抜け以外後"],
      ["game_ceiling_after_runthrough", "駆け抜け後"],
      ["game_ceiling_after_nonrunthrough_joui", "上位後"],
      ["reset", "リセット"]
    ]);
    for (const group of result.groups) {
      for (const rate of ["4652", "5050"]) {
        expect(group.variants[rate]).toBe(values.find(value => value.key === `${group.key}_${rate}`));
      }
    }
    expect(result.rates.map(rate => rate.value)).toEqual(["4652", "5050"]);
    expect(values).toEqual(before);
    const tabs = aimTabs(result.groups, []);
    const markup = renderToStaticMarkup(createElement(ProfileBar, {
      tabs, activeKey: tabs[0].key, onChange: () => undefined
    }));
    for (const label of ["駆け抜け以外後", "駆け抜け後", "上位後", "リセット"]) expect(markup).toContain(label);
    expect(markup).not.toContain("cz_ceiling");
  });

  it("keeps bonus interval aims for other machines and keeps legacy-only Kabaneri pages usable", () => {
    const bonus = profile("bonus", "cz_ceiling_4652");
    const values = [...splitProfiles(), bonus];
    expect(groupProfiles(values, "other-machine").groups.some(group => group.key === "cz_ceiling")).toBe(true);
    expect(groupProfiles([bonus], "mcd43a818").groups[0].variants["4652"]).toBe(bonus);
  });
});

describe("exact filter intersections", () => {
  it("starts with all conditions unrestricted and recognizes explicit zero", () => {
    expect(filterSelectionKey(axes, {})).toBe("");
    expect(filterSelectionKey(axes, { c: "0" })).toBe("c0");
    expect(declaredFilterAxes(profile("cz"))?.map(axis => axis.allLabel)).toEqual(["不問", "不問"]);
  });
  it("honors an explicitly empty axis list without reviving legacy axes", () => {
    const value = profile("cz");
    value.evFilters = { ...value.evFilters!, axes: [], tables: {} };
    expect(declaredFilterAxes(value)).toEqual([]);
    expect(validateMachine(machineWith(value)).profiles[0].evFilters?.axes).toEqual([]);
  });
  it("keeps an interaction-only first selection and never substitutes another table", () => {
    const value = profile("cz");
    const first = compatibleFilterSelection(value, { c: "1" });
    expect(first).toEqual({ c: "1" });
    expect(selectedFilterTable(value, axes, first)).toBeUndefined();
    expect(selectedFilterTable(value, axes, { ...first, p: "100" })).toBe(table);
    expect(selectedFilterTable(value, axes, { c: "0", p: "100" })).toBeUndefined();
    const html = renderToStaticMarkup(createElement(EvFilter, { axes, values: first, onChange: () => {}, units: 0, hits: 0 }));
    expect(html).not.toContain("disabled");
    expect(html).toContain("100G以上");
  });
  it("rejects unknown selections, reordered keys and ambiguous token combinations", () => {
    expect(filterSelectionKey(axes, { c: "2" })).toBeNull();
    expect(filterSelectionKey(axes, { c: "1", unknown: "1" })).toBeNull();
    expect(isExactFilterTableKey(axes, "p100c1")).toBe(false);
    expect(isExactFilterTableKey(axes, "c1p100")).toBe(true);
    const ambiguous = [{ ...axes[0], key: "a", options: [{ value: "bc", label: "x" }] },
      { ...axes[1], key: "ab", options: [{ value: "c", label: "y" }] }];
    expect(isExactFilterTableKey(ambiguous, "abc")).toBe(false);
  });
});

describe("filter contract", () => {
  it("accepts the sparse exact table and its one-sample aggregates", () => {
    expect(validateMachine(machineWith(profile("cz"))).profiles[0].evFilters?.tables.c1p100.hits).toBe(1);
  });
  it.each(["not_a_kind", "at"])('rejects unknown aim kind %s', aimKind => {
    expect(() => validateMachine(machineWith({ ...profile(), aimKind } as Profile))).toThrow(/aimKind/);
  });
  it("rejects undeclared table keys and repeated axis keys", () => {
    const value = profile("cz");
    value.evFilters!.tables = { c99: table };
    expect(() => validateMachine(machineWith(value))).toThrow(/exactly one/);
    value.evFilters!.tables = {};
    value.evFilters!.axes = [axes[0], axes[0]];
    expect(() => validateMachine(machineWith(value))).toThrow(/keys must be unique/);
  });
  it("rejects malformed filter aggregates and out-of-range anchors", () => {
    for (const patch of [{ hits: -1 }, { totalPayout: Number.NaN }, { baseAnchors: [{ ...table.baseAnchors[0], g: 0 }] }]) {
      const value = profile("cz"); value.evFilters!.tables = { c1p100: { ...table, ...patch } };
      expect(() => validateMachine(machineWith(value))).toThrow(/filter/);
    }
  });
});

describe("published saved targets in the normal aim selector", () => {
  const targets = [{ id: "published-id", name: "CZ1スルー・前回100G以上", rate: "46/52" }];
  it("adds published identities without changing profile keys or rows", () => {
    const groups = groupProfiles([profile("cz")]).groups;
    const tabs = aimTabs(groups, targets);
    expect(tabs.map(tab => tab.key)).toEqual(["normal", savedTargetAimKey(targets[0].id)]);
    expect(savedTargetIdFromAim(tabs[1].key, targets)).toBe(targets[0].id);
    const html = renderToStaticMarkup(createElement(ProfileBar, { tabs, activeKey: tabs[1].key, onChange: () => {} }));
    expect(html).toContain(targets[0].name);
    expect(html).toContain('aria-pressed="true"');
  });
  it("drops unlisted targets instead of resurrecting an old saved selection", () => {
    expect(savedTargetIdFromAim(savedTargetAimKey(targets[0].id), [])).toBeNull();
    expect(aimTabs([], [])).toEqual([]);
    expect(savedTargetIdFromAim("normal", targets)).toBeNull();
  });
});
