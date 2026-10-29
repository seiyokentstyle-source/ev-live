import { describe, expect, test } from "vitest";
import { compatibleFilterSelection, declaredFilterAxes, selectedFilterTable, shamanFilterExplanation } from "../lib/ev/profiles";
import type { FilterAxis, Profile } from "../lib/ev/types";

const axes: FilterAxis[] = [
  { key: "bonusThrough", label: "ボーナススルー回数", allLabel: "不問", options: [{ value: "2", label: "2回" }] },
  { key: "releaseStage", label: "解放履歴", allLabel: "不問", options: [{ value: "0", label: "朝一解放前" }] },
  { key: "entryState", label: "打ち始めの状態", allLabel: "不問", options: [
    { value: "1", label: "当該敗北後" }, { value: "2", label: "当該AT後" }
  ] }
];

function fixture(rate: "4652" | "5050" = "5050"): Profile {
  return {
    key: `point_release_${rate}`, label: "巫門遁甲解放まで", ceiling: "解放AT終了まで",
    gRange: { start: 0, end: 0, step: 10 }, activeAxes: [], zones: [],
    baseAnchors: [{ g: 0, ev: 0, n: 3, rtp: 100 }],
    evFilters: { axes, tables: {}, aggregation: {
      schema: "evlive-filter-aggregates/v2", axisKeys: axes.map(axis => axis.key),
      costPerGame: rate === "4652" ? 1000 / 46 : 20,
      exchange: rate === "4652" ? 1000 / 52 : 20, medalsPerGame: 1,
      junzou: 2.5, bet: 3, investmentMinimum: "mean", roundingEpsilon: 1e-9,
      // Same cumulative count and stage, different entry states and cashflows.
      rows: [[0, 0, 0, 0, 1, 100, 200], [0, 0, 0, 1, 2, 200, 250]]
    } }
  };
}

describe("Shaman cumulative failures and entry state", () => {
  test.each(["4652", "5050"] as const)("keeps defeat-after and AT-after cohorts separate at %s", rate => {
    const profile = fixture(rate);
    const declared = declaredFilterAxes(profile, "m695e7825")!;
    const defeat = selectedFilterTable(profile, declared, { bonusThrough: "2", releaseStage: "0", entryState: "1" });
    const afterAt = selectedFilterTable(profile, declared, { bonusThrough: "2", releaseStage: "0", entryState: "2" });
    expect(defeat?.baseAnchors[0].n).toBe(1);
    expect(afterAt?.baseAnchors[0].n).toBe(2);
    expect(defeat?.baseAnchors[0].ev).not.toBe(afterAt?.baseAnchors[0].ev);
    expect(compatibleFilterSelection(profile, { bonusThrough: "2", releaseStage: "0", entryState: "2" }))
      .toEqual({ bonusThrough: "2", releaseStage: "0", entryState: "2" });
  });

  test("clarifies old axis names without changing identities, options or cashflow", () => {
    const profile = fixture();
    const before = structuredClone(profile);
    const declared = declaredFilterAxes(profile, "m695e7825")!;
    expect(declared.map(axis => axis.key)).toEqual(axes.map(axis => axis.key));
    expect(declared[0].label).toBe("累計ボーナス敗北回数");
    expect(declared[1].options[0].label).toBe("朝一・推定解放前");
    expect(profile).toEqual(before);
    expect(declaredFilterAxes(profile, "other")![0].label).toBe("ボーナススルー回数");
  });

  test("never invents an entry-state filter for old two-axis payloads", () => {
    const profile = fixture();
    profile.evFilters!.axes = axes.slice(0, 2);
    expect(declaredFilterAxes(profile, "m695e7825")).toHaveLength(2);
    expect(shamanFilterExplanation("m695e7825", profile)).toContain("集計待ち");
    expect(shamanFilterExplanation("m695e7825", fixture())).toContain("分けて選べます");
    expect(shamanFilterExplanation("other", profile)).toBeUndefined();
  });

  test("does not call the ordinary AT-local bonus count cumulative failures", () => {
    const profile = fixture();
    profile.key = "cz_ceiling_5050";
    profile.evFilters!.axes = [{ ...axes[0], key: "bonus" }];
    expect(declaredFilterAxes(profile, "m695e7825")![0].label).toBe("AT後・朝一のボーナス回数");
    expect(shamanFilterExplanation("m695e7825", profile)).toContain("起点が異なります");
    expect(shamanFilterExplanation("m695e7825", profile)).toContain("朝一は営業開始以降");
  });
});
