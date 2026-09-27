import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { validateCollectedMachine, validateCollectionCatalog } from "../lib/collection-status-contract";
import { buildLiveCollection } from "../lib/live-data";
import { selectMachineListSummaries } from "../lib/machine-list-summary";
import { MachineCard } from "../components/machine-list/MachineCard";
import { LiveMachineClient } from "../app/machines/[id]/MachineDetailClient";
import { computeAnchors, defaultConditions, generateRows } from "../lib/ev/calc";
import { getHall } from "../lib/halls";
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
    ])).toEqual([{ ...summary, summaryHallId: "shinjuku" }]);
  });
  it("includes non-default-only machines once and preserves the selected hall's counts", () => {
    const shinjuku = { ...collectedFixture("same").summary, meta: { samples: "123", source: "新宿" } };
    const kabuki = { ...collectedFixture("same").summary, meta: { samples: "456", source: "歌舞伎" } };
    const entries = [{ hallId: "kabuki", summary: kabuki }, { hallId: "mixed", summary: collectedFixture("mixedonly").summary },
      { hallId: "shinjuku", summary: shinjuku }, { hallId: "kabuki", summary: collectedFixture("kabukionly").summary }];
    const selected = selectMachineListSummaries(entries);
    expect(selected).toHaveLength(3);
    expect(selected.find(item => item.id === "same")).toMatchObject({ summaryHallId: "shinjuku", meta: { samples: "123" } });
    const only = selected.find(item => item.id === "kabukionly")!;
    const html = renderToString(createElement(MachineCard, { machine: only, isFavorite: false,
      match: { type: "none" }, onOpen: vi.fn(), onToggleFavorite: vi.fn() }));
    expect(html).toContain("歌舞伎のお店");
    expect(html).toContain("収集済み 1,200行");
    expect(html).not.toContain("サンプル（主ボーナス");
  });
});
