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
