import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { validateCollectedMachine, validateCollectionCatalog } from "../lib/collection-status-contract";
import { buildLiveCollection } from "../lib/live-data";
import { selectMachineListSummaries } from "../lib/machine-list-summary";
import { MachineCard } from "../components/machine-list/MachineCard";
import { LiveMachineClient } from "../app/machines/[id]/MachineDetailClient";
import { computeAnchors, defaultConditions, generateRows } from "../lib/ev/calc";
import { getHall, HALLS } from "../lib/halls";
import { validateMachine } from "../lib/ev/validate";
import numericFixture from "../app/preview/ev-table/machine.json";
import { catalogFixture, collectedFixture } from "./fixtures/collection-status";

vi.mock("../lib/ev/calc", async importOriginal => {
  const actual = await importOriginal<typeof import("../lib/ev/calc")>();
  return { ...actual, computeAnchors: vi.fn(actual.computeAnchors),
    defaultConditions: vi.fn(actual.defaultConditions), generateRows: vi.fn(actual.generateRows) };
});

describe("collection publication contract", () => {
  it("does not permit an unknown release date in the existing numerical machine contract", () => {
    expect(() => validateMachine({ ...numericFixture, releaseDate: null })).toThrow("Invalid machine data");
  });
  it.each(["shinjuku", "kabuki"])("accepts unknown release dates only through the observation contract for %s", hallId => {
    const data = catalogFixture("future", false, hallId);
    Object.assign(data.machines[0], { releaseDate: null, manufacturer: "未確認" });
    const [entry] = validateCollectionCatalog(data, hallId);
    const payload = buildLiveCollection(entry);
    expect(payload.machine).toMatchObject({ manufacturer: "未確認", releaseDate: null });
    expect(payload.machine).not.toHaveProperty("economics");
    const html = renderToString(createElement(LiveMachineClient, { initial: payload, hall: getHall(hallId)! }));
    expect(html).toContain("期待値算出保留");
    expect(html).toContain("保存済みの履歴を表示");
    expect(html).not.toContain(getHall(hallId)!.note);
    expect(html).not.toContain("公表仕様");
  });

  it("rejects unknown source types and identifiers belonging to the other source format", () => {
    for (const [source, storeId] of [["other", "100949"], ["daidata", "00001050"], ["site_seven", "123"], ["site_seven", "0000/1050"]]) {
      const data = catalogFixture();
      Object.assign(data, { source, storeId });
      expect(() => validateCollectionCatalog(data, "kabuki")).toThrow("source mismatch");
    }
  });
  it("accepts daily observations with no history and separates saved rows from EV samples", () => {
    const data = catalogFixture();
    data.machines[0].collection.rows = 0;
    data.machines[0].collection.events = 0;
    const [entry] = validateCollectionCatalog(data, "kabuki");
    expect(entry.summary.meta).toMatchObject({ samples: "0", collection: { rows: 0, units: 2, days: 3 } });
  });

  it.each([
    ["wrong hall", (v: any) => { v.hallId = "shinjuku"; }],
    ["invalid date", (v: any) => { v.machines[0].collection.firstDate = "2026-02-30"; }],
    ["target date differs", (v: any) => { v.machines[0].sourceIntegrity.targetDate = "2026-09-25"; }],
    ["negative rows", (v: any) => { v.machines[0].collection.rows = -1; }],
    ["events exceed rows", (v: any) => { v.machines[0].collection.events = 1201; }],
    ["invalid reason", (v: any) => { v.machines[0].pendingReason = " "; }],
    ["invalid code", (v: any) => { v.machines[0].reasonCode = "financial_estimate"; }],
    ["duplicates", (v: any) => { v.machines.push(v.machines[0]); }],
  ])("rejects %s", (_name, mutate) => {
    const data = catalogFixture();
    mutate(data);
    expect(() => validateCollectionCatalog(data, "kabuki")).toThrow("Invalid collection status");
  });

  it("whitelists the public DTO without numbers, replay or financial metadata attached by upstream", () => {
    const base = collectedFixture();
    const financial = { profiles: [{ ev: 999 }], economics: { payout: 1000 }, settingAim: {}, atPayout: {},
      intervalExplorer: { ciphertext: "secret" }, savedTargets: [{ ev: 999 }], spec: {}, calcSpec: {} };
    const payload = buildLiveCollection({ ...base, ...financial,
      summary: { ...base.summary, ...financial, meta: { ...base.summary.meta, financial } } });
    for (const key of Object.keys(financial)) {
      expect(payload).not.toHaveProperty(key);
      expect(payload.machine).not.toHaveProperty(key);
      expect(payload.pending).not.toHaveProperty(key);
    }
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(payload.machine.meta).not.toHaveProperty("financial");
    expect(payload.machine.meta.samples).toBe("0");
    expect(validateCollectedMachine({ ...payload.pending, summary: payload.machine })).toEqual(base);
    expect(buildLiveCollection({ ...base, pendingReason: "再確認中" }).revision).not.toBe(payload.revision);
  });
});

describe("collection-only UI", () => {
  it.each([1200, 0])("renders collected facts and reason for %i rows without running financial calculations", rows => {
    const collection = collectedFixture();
    collection.summary.meta.collection!.rows = rows;
    collection.summary.meta.collection!.events = rows === 0 ? 0 : 1100;
    collection.collectionComplete = false;
    const html = renderToString(createElement(LiveMachineClient, {
      initial: buildLiveCollection(collection), hall: getHall("kabuki")!,
    }));
    expect(html).toContain("期待値算出保留");
    expect(html).toContain(collection.pendingReason);
    expect(html).toContain("2026-09-23");
    expect(html).toContain("2026-09-26");
    expect(html).toContain("全台分の取得確認はまだ完了していません");
    if (rows === 0) expect(html).toContain("当たり履歴はまだ保存されていません");
    expect(html).not.toContain("<table");
    for (const label of ["機械割", "平均獲得", "交換率", "時給", "公表仕様", "算出条件"]) expect(html).not.toContain(label);
    expect(defaultConditions).not.toHaveBeenCalled();
    expect(computeAnchors).not.toHaveBeenCalled();
    expect(generateRows).not.toHaveBeenCalled();
  });
});

describe("multi-hall machine list", () => {
  it("orders observations with unknown dates deterministically without inventing a date", () => {
    const known = collectedFixture("known").summary;
    const unknown = { ...collectedFixture("unknown").summary, releaseDate: null };
    const second = { ...unknown, id: "another" };
    const selected = selectMachineListSummaries([unknown, second, known].map(summary => ({ hallId: "kabuki", summary })));
    expect(selected.map(item => item.id)).toEqual(["known", "another", "unknown"]);
    expect(selected.find(item => item.id === "unknown")?.releaseDate).toBeNull();
  });
  it("ignores unknown and inactive halls even when their entries precede the default hall", () => {
    const summary = collectedFixture().summary;
    expect(selectMachineListSummaries([
      { hallId: "unregistered", summary }, { hallId: "akihabara", summary }, { hallId: "shinjuku", summary },
      { hallId: "unregistered", summary: collectedFixture("unknownonly").summary },
    ])).toEqual([{ ...summary, summaryHallId: "shinjuku", totalSamples: 0 }]);
  });
  it("prefers raw mixed samples without double counting and retains each hall's metadata", () => {
    const shinjuku = { ...collectedFixture("same").summary, meta: { samples: "123", source: "新宿" } };
    const kabuki = { ...collectedFixture("same").summary, meta: { samples: "456", source: "歌舞伎" } };
    const entries = [{ hallId: "kabuki", summary: kabuki }, { hallId: "mixed", summary: collectedFixture("mixedonly").summary },
      { hallId: "shinjuku", summary: shinjuku }, { hallId: "kabuki", summary: collectedFixture("kabukionly").summary },
      { hallId: "kabuki", summary: kabuki },
      ...["mixed", "mixed-raw"].map(hallId => ({ hallId, summary: { ...shinjuku, meta: { samples: "579", source: "混合" } } }))];
    const before = JSON.stringify(entries);
    const selected = selectMachineListSummaries(entries);
    expect(selected).toHaveLength(3);
    expect(selected.find(item => item.id === "same")).toMatchObject({ summaryHallId: "shinjuku", meta: { samples: "123" }, totalSamples: 579 });
    expect(selected.find(item => item.id === "same")?.meta).toBe(shinjuku.meta);
    expect(selected.find(item => item.id === "mixedonly")?.totalSamples).toBe(0);
    expect(JSON.stringify(entries)).toBe(before);
    const only = selected.find(item => item.id === "kabukionly")!;
    const html = renderToString(createElement(MachineCard, { machine: only, isFavorite: false,
      match: { type: "none" }, onOpen: vi.fn(), onToggleFavorite: vi.fn() }));
    expect(html).toContain("歌舞伎のお店");
    expect(html).toContain("収集済み 1,200行");
    expect(html).toContain("全店舗合計");
    expect(html).toContain("サンプル（主ボーナス");
    expect(only.totalSamples).toBe(0);
  });
  it("keeps mixed-only contributions in totals while omitting their standalone cards and names", () => {
    const summary = (id: string, samples: string) => ({ ...collectedFixture(id).summary, meta: { samples, source: "fixture" } });
    const entries = [
      { hallId: "shinjuku", summary: summary("same", "100") },
      { hallId: "akiba_espace", summary: summary("same", "50") },
      { hallId: "mixed", summary: summary("same", "150") },
      { hallId: "mixed-raw", summary: summary("same", "150") },
      { hallId: "akiba_espace", summary: summary("subsetonly", "50") },
      { hallId: "mixed-raw", summary: summary("subsetonly", "50") },
      { hallId: "akiba_espace", summary: summary("unpublished", "50") },
    ];
    const selected = selectMachineListSummaries(entries);
    expect(selected).toHaveLength(2);
    expect(selected.find(item => item.id === "same")).toMatchObject({ totalSamples: 150, summaryHallId: "shinjuku" });
    const only = selected.find(item => item.id === "subsetonly")!;
    expect(only).toMatchObject({ totalSamples: 50, summaryHallId: "mixed-raw" });
    expect(selectMachineListSummaries(entries.filter(entry => entry.hallId !== "akiba_espace"))).toEqual(selected);
    const html = renderToString(createElement(MachineCard, { machine: only, isFavorite: false,
      match: { type: "none" }, onOpen: vi.fn(), onToggleFavorite: vi.fn() }));
    expect(html).toContain("全店舗合計");
    expect(html).not.toContain("電気街口のお店");
  });
  it("uses confirmed raw mixed zero and falls back to visible physical counts for legacy entries", () => {
    const summary = collectedFixture().summary;
    const entry = (hallId: string, samples: string) => ({ hallId, summary: { ...summary, meta: { samples, source: "fixture" } } });
    const physical = [entry("shinjuku", "100"), entry("akiba_espace", "500"), entry("kabuki", "50")];
    expect(selectMachineListSummaries(physical)[0].totalSamples).toBe(150);
    expect(selectMachineListSummaries([...physical, entry("mixed-raw", "0")])[0].totalSamples).toBe(0);
    expect(selectMachineListSummaries([...physical, entry("mixed-raw", "-")])[0].totalSamples).toBe(150);
  });
  it("shows available samples from another hall even if the representative hall is pending", () => {
    const pending = collectedFixture("same").summary;
    const numeric = { ...pending, meta: { samples: "1,234", source: "歌舞伎" } };
    const [selected] = selectMachineListSummaries([
      { hallId: "shinjuku", summary: pending }, { hallId: "kabuki", summary: numeric },
    ]);
    expect(selected).toMatchObject({ totalSamples: 1234, summaryHallId: "shinjuku", meta: { samples: "0" } });
    const html = renderToString(createElement(MachineCard, { machine: selected, isFavorite: false,
      match: { type: "none" }, onOpen: vi.fn(), onToggleFavorite: vi.fn() }));
    expect(html).toContain("全店舗合計");
    expect(html).toContain("1,234");
    expect(html).toContain("ゴジラのお店：");
    expect(html).toContain("収集済み 1,200行");
  });
  it("includes newly registered physical halls and excludes aliases of virtual data sources", () => {
    const template = getHall("kabuki")!;
    const countBefore = HALLS.length;
    HALLS.push({ ...template, id: "new-store", dataSubdir: "new-store" },
      { ...template, id: "virtual-alias", dataSubdir: "mixed" },
      { ...template, id: "raw-alias", dataSubdir: "mixed-raw" });
    try {
      const summary = { ...collectedFixture().summary, meta: { samples: "100", source: "fixture" } };
      const [selected] = selectMachineListSummaries(["shinjuku", "new-store", "virtual-alias", "raw-alias"]
        .map(hallId => ({ hallId, summary })));
      expect(selected.totalSamples).toBe(200);
    } finally {
      HALLS.splice(countBefore);
    }
  });
  it("does not add unavailable machines, observation rows or malformed sample counts", () => {
    const summary = collectedFixture().summary;
    const [selected] = selectMachineListSummaries([
      { hallId: "shinjuku", summary },
      { hallId: "kabuki", summary: { ...summary, available: false, meta: { samples: "999", source: "fixture" } } },
    ]);
    expect(selected.totalSamples).toBe(0);
    for (const samples of ["", "-", "-5", "1.5", "1,2", "5 samples"]) {
      expect(selectMachineListSummaries([{ hallId: "shinjuku", summary: { ...summary, meta: { samples, source: "fixture" } } }])[0].totalSamples).toBe(0);
    }
  });
});
