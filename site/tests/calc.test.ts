import { describe, expect, test } from "vitest";
import type { EvCalc, EvSamples, Machine, Profile } from "../lib/ev/types";
import { avgMedals, baseEV, baseRtp, calcEV, computeAnchors, defaultConditions, generateRows } from "../lib/ev/calc";
import { groupProfiles, resolveProfile } from "../lib/ev/profiles";
import { validateMachine } from "../lib/ev/validate";
import vvv2Data from "../../data/machines/vvv2.json";

// サイトの「道中CZ回数」絞り込みと同じバケット化（MachineDetailClient と揃える）。
function czBucket(cz: number | undefined): string {
  if (cz === undefined) return "";
  if (cz >= 2) return "2";
  return String(cz);
}

// Synthetic fixtures so the math tests do not depend on the nightly-scraped
// numbers in data/machines/*.json.
const profile: Profile = {
  key: "sample_4652",
  label: "テスト・46/52",
  ceiling: "1000G",
  gRange: { start: 0, end: 1000, step: 100 },
  activeAxes: ["rate"],
  baseAnchors: [
    { g: 0, ev: -1000, rtp: 90 },
    { g: 500, ev: 1000, rtp: 120 }
  ],
  zones: []
};

const machine: Machine = {
  id: "sample",
  name: "Sample",
  manufacturer: "X",
  aliases: [],
  thumb: null,
  available: true,
  releaseDate: "2025-01-01",
  lastUpdated: "2025-01-01",
  meta: { samples: "0", source: "synthetic" },
  profiles: [profile],
  axes: [
    { key: "rate", label: "レート", type: "select", pivotable: false, default: "tab", options: [{ value: "tab", label: "tab" }] }
  ],
  modifiers: { rate: { tab: 0 } },
  creditValue: { tab: 20 },
  economics: { medalsPerGame: 2, gamesPerHour: 800 }
};

const conditions = defaultConditions(machine);

describe("EV math", () => {
  test("interpolates base EV and RTP", () => {
    expect(baseEV(0, profile)).toBe(-1000);
    expect(baseEV(250, profile)).toBe(0); // midpoint of -1000..1000
    expect(baseRtp(0, profile)).toBe(90);
    expect(baseRtp(250, profile)).toBe(105);
  });

  test("calcEV applies the (no-op) rate modifier", () => {
    expect(calcEV(0, conditions, profile, machine)).toBe(-1000);
    expect(calcEV(500, conditions, profile, machine)).toBe(1000);
  });

  test("avgMedals from remaining games", () => {
    expect(avgMedals(0, profile, machine)).toBe(1000 * 2);
    expect(avgMedals(1000, profile, machine)).toBe(0);
  });

  test("marks rows past the last sampled anchor as no-data", () => {
    const rows = generateRows(profile, machine, conditions);
    expect(rows.find((row) => row.g === 500)?.noData).toBeFalsy();
    const beyond = rows.filter((row) => row.g > 500);
    expect(beyond.length).toBeGreaterThan(0);
    for (const row of beyond) {
      expect(row.noData).toBe(true);
    }
  });
});

describe("rate grouping", () => {
  test("groups _4652/_5050 profiles into one tab per 狙い方 with rate options", () => {
    const profiles: Profile[] = [
      { ...profile, key: "after_first_4652", label: "通常・46/52（n=10）" },
      { ...profile, key: "after_first_5050", label: "通常・50/50（n=10）" },
      { ...profile, key: "morning_4652", label: "朝一・46/52（n=5）" },
      { ...profile, key: "morning_5050", label: "朝一・50/50（n=5）" }
    ];
    const grouped = groupProfiles(profiles);

    expect(grouped.groups.map((group) => group.key)).toEqual(["after_first", "morning"]);
    // ラベルの「（n=◯◯）」は除去され、サンプル件数は EvTable の列に一本化される。
    expect(grouped.groups[0].label).toBe("通常");
    expect(grouped.rates.map((rate) => rate.value)).toEqual(["4652", "5050"]);
    expect(grouped.rates[1].label).toBe("50/50（等価）");
    expect(grouped.defaultRate).toBe("4652");
    expect(resolveProfile(grouped.groups[0], "4652").key).toBe("after_first_4652");
    expect(resolveProfile(grouped.groups[0], "5050").key).toBe("after_first_5050");
  });

  test("old-format profiles without a rate suffix stay ungrouped (backward compatible)", () => {
    const profiles: Profile[] = [{ ...profile, key: "game_ceiling", label: "ゲーム数天井" }];
    const grouped = groupProfiles(profiles);

    expect(grouped.rates).toHaveLength(0);
    expect(grouped.defaultRate).toBeNull();
    expect(grouped.groups[0].key).toBe("game_ceiling");
    expect(resolveProfile(grouped.groups[0], null).key).toBe("game_ceiling");
  });
});

describe("sample size (n)", () => {
  test("surfaces the anchor n on the exact-G row and leaves interpolated rows undefined", () => {
    const withN: Profile = {
      ...profile,
      baseAnchors: [
        { g: 0, ev: -1000, rtp: 90, n: 40 },
        { g: 500, ev: 1000, rtp: 120, n: 12 }
      ]
    };
    const rows = generateRows(withN, machine, conditions);
    expect(rows.find((row) => row.g === 0)?.n).toBe(40);
    expect(rows.find((row) => row.g === 500)?.n).toBe(12);
    // gRange step is 100, so g=100 is interpolated (no anchor) and carries no n.
    expect(rows.find((row) => row.g === 100)?.n).toBeUndefined();
  });

  test("old anchors without n stay undefined and do not crash", () => {
    const rows = generateRows(profile, machine, conditions);
    expect(rows.every((row) => row.n === undefined)).toBe(true);
  });
});

describe("道中CZ回数フィルタ（hitsの5要素目）", () => {
  const evCalc: EvCalc = { use: 1.53, junzou: 9, ceiling: 500, step: 100 };
  // [台番号, 取得日, 初当りG, 総獲得, 道中CZ数]
  const hits: EvSamples["hits"] = [
    ["101", "2026-07-01", 100, 500, 0],
    ["101", "2026-07-01", 200, 600, 1],
    ["102", "2026-07-02", 150, 700, 1],
    ["102", "2026-07-02", 300, 900, 2],
    ["103", "2026-07-03", 250, 800, 3]
  ];

  test("czBucket は 0/1/2以上 に丸める", () => {
    expect(hits.map((h) => czBucket(h[4]))).toEqual(["0", "1", "1", "2", "2"]);
  });

  test("CZ=1 で絞ると該当2件だけが残る", () => {
    const only1 = hits.filter((h) => czBucket(h[4]) === "1");
    expect(only1.map((h) => h[2])).toEqual([200, 150]);
  });

  test("computeAnchors は5要素目(CZ数)を無視して従来通り集計する", () => {
    // minSess=1・打ち切りなしで、CZ=1の部分集合だけでアンカーが立つ。
    const subset = hits.filter((h) => czBucket(h[4]) === "1");
    const anchors = computeAnchors(subset, [], evCalc, 21.74, 19.23, 1);
    expect(anchors.length).toBeGreaterThan(0);
    // 0G地点は2件（初当りG 150,200）が母数
    expect(anchors[0].n).toBe(2);
  });

  test("4要素のみ（CZ情報なし）のhitsでも壊れない", () => {
    const legacy: EvSamples["hits"] = [
      ["101", "2026-07-01", 100, 500],
      ["102", "2026-07-02", 200, 600]
    ];
    expect(legacy.map((h) => czBucket(h[4]))).toEqual(["", ""]);
    const anchors = computeAnchors(legacy, [], evCalc, 21.74, 19.23, 1);
    expect(anchors[0].n).toBe(2);
  });
});

describe("前兆補正（preg：打ち始めから前兆Gは当たらない・投資はフル）", () => {
  const tai = 21.74;
  const kan = 19.23;
  // 初当りG 100/130/200 の3件。前兆32・10G刻みで検証する。
  const hits: EvSamples["hits"] = [
    ["101", "2026-07-01", 100, 500],
    ["102", "2026-07-02", 130, 600],
    ["103", "2026-07-03", 200, 700]
  ];

  test("preg=0（従来）はアンカーgに 初当りG>=g の全件が母数", () => {
    const calc: EvCalc = { use: 1.53, junzou: 9, ceiling: 300, step: 10 };
    const anchors = computeAnchors(hits, [], calc, tai, kan, 1);
    // g=100 では 100/130/200 の3件すべて当たり扱い
    expect(anchors.find((a) => a.g === 100)?.n).toBe(3);
  });

  test("preg=32 だと g から32G以内の当たりは母数から外れる", () => {
    const calc: EvCalc = { use: 1.53, junzou: 9, ceiling: 300, step: 10, preg: 32 };
    const anchors = computeAnchors(hits, [], calc, tai, kan, 1);
    // g=100: 当たり扱いは 初当りG>=132 の {200} だけ（100と130は前兆窓内で除外）
    const a100 = anchors.find((a) => a.g === 100);
    expect(a100?.n).toBe(1);
  });

  test("投資は実G基準（前兆分も引かない）＝ (初当りG - g)×use のまま", () => {
    const calc: EvCalc = { use: 1.53, junzou: 9, ceiling: 300, step: 10, preg: 32 };
    // 打ち切りなし・minSess=1、g=100で母数は{200}のみ。
    // 平均投資枚数 inv = (200-100)*1.53 = 153（前兆32を引かない）。
    const anchors = computeAnchors(hits, [], calc, tai, kan, 1);
    const a100 = anchors.find((a) => a.g === 100);
    expect(a100?.inv).toBe(Math.round((200 - 100) * 1.53));
  });
});

describe("real machine data", () => {
  test("vvv2 validates and every 狙い方 group resolves a profile", () => {
    const realMachine = validateMachine(vvv2Data);
    const grouped = groupProfiles(realMachine.profiles);
    expect(grouped.groups.length).toBeGreaterThan(0);
    for (const group of grouped.groups) {
      expect(resolveProfile(group, grouped.defaultRate)).toBeDefined();
    }
  });
});
