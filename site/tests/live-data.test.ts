import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { validateMachine } from "../lib/ev/validate";
import { getAvailableMachines, getMachine, getHallDisplays, getHallDisplay } from "../lib/machines";
import { getHall, getReadyHalls } from "../lib/halls";
import { getSavedTargetCatalog, getSavedTargetSnapshot } from "../lib/saved-target-catalog";
import { buildLiveMachine, buildLiveCollection, getLiveIndex, getLiveMachine, liveIndexEntry } from "../lib/live-data";
import { collectedFixture } from "./fixtures/collection-status";
import { selectMachineListSummaries } from "../lib/machine-list-summary";
import { GET as indexGET } from "../app/live-data/index.json/route";
import { GET as machineGET, generateStaticParams } from "../app/live-data/[hall]/[id]/route";
import type { PublishedTarget, SavedTargetCatalog } from "../lib/saved-targets.mjs";

vi.mock("../lib/machines", () => ({ getAvailableMachines: vi.fn(), getMachine: vi.fn(), getHallDisplays: vi.fn(), getHallDisplay: vi.fn() }));
vi.mock("../lib/saved-target-catalog", () => ({ getSavedTargetCatalog: vi.fn(), getSavedTargetSnapshot: vi.fn() }));

const target: PublishedTarget = {
  id: "7de93a9e-0830-4995-a6dc-8e8bfb451460", name: "狙い目", machineId: fixture.id, hallId: "shinjuku",
  conditionKey: "a".repeat(64), publicationKey: "b".repeat(64), sourceRevision: "c".repeat(64),
  definition: { schema: "interval-target/v1", machineId: fixture.id, hallId: "shinjuku", profileKey: "game_ceiling",
    startG: 100, endG: null, filters: {}, rate: "46/52", stopRule: "evlive" },
  machine: fixture.name, profile: "通常", conditions: "", stopping: "当選後終了", rate: "46/52",
  dataThrough: "2026-09-03", updatedAt: "2026-09-10T01:00:00.000Z", rows: [{ g: 100, ev: 100, n: 10, days: 3 }]
};
const catalog = (targets: PublishedTarget[] = []): SavedTargetCatalog => ({
  schema: "evlive-saved-targets/v1", updatedAt: "2026-09-10T01:00:00.000Z", targets
});

beforeEach(() => {
  vi.clearAllMocks();
  const machine = validateMachine(structuredClone(fixture));
  vi.mocked(getAvailableMachines).mockResolvedValue([machine]);
  vi.mocked(getMachine).mockImplementation(async (id) => id === machine.id ? machine : undefined);
  vi.mocked(getHallDisplays).mockImplementation(async hallId =>
    (await getAvailableMachines(getHall(hallId)?.dataSubdir)).map(machine => ({ kind: "machine", machine })));
  vi.mocked(getHallDisplay).mockImplementation(async (id, hallId) => {
    const machine = await getMachine(id, getHall(hallId)?.dataSubdir);
    return machine?.available ? { kind: "machine", machine } : undefined;
  });
  vi.mocked(getSavedTargetCatalog).mockResolvedValue(catalog());
  vi.mocked(getSavedTargetSnapshot).mockResolvedValue({ refreshed: [], replaySource: undefined });
});

describe("live data publication", () => {
  it("keeps every hall's own samples in the live feed while the list sums physical halls once", async () => {
    const samples = new Map([["shinjuku", "100"], ["kabuki", "40"], ["mixed", "140"], ["mixed-raw", "140"]]);
    const machines = new Map([...samples].map(([hall, count]) => [hall,
      validateMachine({ ...fixture, meta: { ...fixture.meta, samples: count } })]));
    vi.mocked(getHallDisplays).mockImplementation(async hall => {
      const machine = machines.get(hall);
      return machine ? [{ kind: "machine", machine }] : [];
    });
    vi.mocked(getHallDisplay).mockImplementation(async (_id, hall) => {
      const machine = machines.get(hall);
      return machine ? { kind: "machine", machine } : undefined;
    });
    const index = await getLiveIndex();
    expect(new Map(index.machines.map(entry => [entry.hallId, entry.summary.meta.samples]))).toEqual(samples);
    expect(index.machines.every(entry => !("totalSamples" in entry.summary))).toBe(true);
    const list = selectMachineListSummaries(index.machines);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ totalSamples: 140, summaryHallId: "shinjuku", meta: { samples: "100" } });
    const detail = await getLiveMachine(fixture.id, "kabuki");
    expect(detail?.machine.meta.samples).toBe("40");
    expect(detail?.machine).not.toHaveProperty("totalSamples");
    expect(index.machines.find(entry => entry.hallId === "kabuki")?.revision).toBe(detail?.revision);
  });

  it("publishes a pending hall as zero rather than adding its collected events to list totals", async () => {
    const machine = validateMachine({ ...fixture, meta: { ...fixture.meta, samples: "25" } });
    const collection = collectedFixture(fixture.id);
    vi.mocked(getHallDisplays).mockImplementation(async hall => hall === "shinjuku"
      ? [{ kind: "machine", machine }] : hall === "kabuki" ? [{ kind: "collection", collection }] : []);
    const index = await getLiveIndex();
    const pending = index.machines.find(entry => entry.hallId === "kabuki")!;
    expect(pending.summary.meta).toMatchObject({ samples: "0", collection: { rows: 1200, events: 1100 } });
    expect(selectMachineListSummaries(index.machines)[0]).toMatchObject({ totalSamples: 25, meta: { samples: "25" } });
  });

  it("changes the revision for new samples and for recalculated rows on the same date", () => {
    const original = buildLiveMachine(fixture, "shinjuku", catalog());
    const increased = structuredClone(fixture);
    increased.meta.samples = "1,000";
    expect(buildLiveMachine(increased, "shinjuku", catalog()).revision).not.toBe(original.revision);
    const recalculated = structuredClone(fixture);
    recalculated.profiles[0].baseAnchors[0].n += 1;
    expect(buildLiveMachine(recalculated, "shinjuku", catalog()).revision).not.toBe(original.revision);
    expect(buildLiveMachine(structuredClone(fixture), "shinjuku", catalog()).revision).toBe(original.revision);
  });

  it("omits explorer data and unpublished targets, and detects publication removal", () => {
    const refreshed = { id: target.id, conditionKey: target.conditionKey, sourceRevision: "d".repeat(64),
      dataThrough: "2026-09-04", rows: [{ g: 100, ev: 120, n: 15, days: 4 }] };
    const detached = { ...refreshed, id: "unpublished-target" };
    const data = { ...fixture, intervalExplorer: { schema: "evlive-interval-envelope/v1", id: fixture.id,
      hallId: "shinjuku", sourceRevision: refreshed.sourceRevision, ciphertext: "private-envelope" }, savedTargets: [refreshed, detached] };
    const published = buildLiveMachine(data, "shinjuku", catalog([target]), [refreshed, detached]);
    expect(published.machine).not.toHaveProperty("intervalExplorer");
    expect(published.machine).not.toHaveProperty("savedTargets");
    expect(published.savedTargets).toHaveLength(1);
    expect(published.savedTargets[0]).toMatchObject({ id: target.id, refreshed: true, rows: refreshed.rows });
    expect(JSON.stringify(published)).not.toContain("private-envelope");
    expect(JSON.stringify(published)).not.toContain("unpublished-target");
    const removed = buildLiveMachine(data, "shinjuku", catalog(), [refreshed, detached]);
    expect(removed.savedTargets).toEqual([]);
    expect(removed.revision).not.toBe(published.revision);
    expect(removed.revision).toBe(buildLiveMachine(fixture, "shinjuku", catalog()).revision);
  });

  it("keeps the polling index to the fields needed by the list and hall selector", () => {
    const detail = buildLiveMachine(fixture, "shinjuku", catalog());
    const entry = liveIndexEntry("shinjuku", detail);
    expect(entry).toMatchObject({ id: fixture.id, hallId: "shinjuku", revision: detail.revision });
    expect(Object.keys(entry.summary).sort()).toEqual([
      "id", "name", "manufacturer", "aliases", "available", "thumb", "releaseDate", "lastUpdated", "meta"
    ].sort());
    expect(entry.summary.meta.samples).toBe(fixture.meta.samples);
    expect(entry.summary).not.toHaveProperty("profiles");
  });

  it("uses the raw source revision even after public Machine validation strips its envelope", async () => {
    vi.mocked(getSavedTargetCatalog).mockResolvedValue(catalog([target]));
    vi.mocked(getSavedTargetSnapshot).mockResolvedValue({ refreshed: [], replaySource: "d".repeat(64) });
    const stale = await getLiveMachine(fixture.id, "shinjuku");
    expect(stale?.schema === "evlive-live-machine/v1" && stale.savedTargets).toEqual([]);
    expect((await getLiveIndex()).machines.find(item => item.hallId === "shinjuku")?.revision).toBe(stale?.revision);
    vi.mocked(getSavedTargetSnapshot).mockResolvedValue({ refreshed: [], replaySource: target.sourceRevision });
    const current = await getLiveMachine(fixture.id, "shinjuku");
    expect(current?.schema === "evlive-live-machine/v1" && current.savedTargets).toHaveLength(1);
    expect(current?.revision).not.toBe(stale?.revision);
  });

  it("does not display prior cashflows when a new envelope format is unsupported", () => {
    const data = { ...fixture, intervalExplorer: { schema: "future-envelope", id: fixture.id,
      hallId: "shinjuku", sourceRevision: target.sourceRevision } };
    expect(buildLiveMachine(data, "shinjuku", catalog([target])).savedTargets).toEqual([]);
  });

  it("publishes matching index and detail revisions through static JSON routes", async () => {
    const index = await (await indexGET()).json();
    const response = await machineGET(new Request("https://example.test/live-data/shinjuku/vvv2.json"), {
      params: Promise.resolve({ hall: "shinjuku", id: `${fixture.id}.json` })
    });
    const detail = await response.json();
    expect(index.schema).toBe("evlive-live-index/v1");
    expect(detail.schema).toBe("evlive-live-machine/v1");
    expect(index.machines[0].revision).toBe(detail.revision);
    expect(detail.machine.meta.samples).toBe(index.machines[0].summary.meta.samples);
    // This fixture supplies one machine per hall. Every ready registry entry,
    // including newly published stores, must have matching index/detail routes.
    const expectedRoutes = getReadyHalls().map(hall => ({
      hall: hall.id, id: `${fixture.id}.json`
    }));
    expect(await generateStaticParams()).toEqual(expectedRoutes);
    expect(index.machines.map((entry: { hallId: string; id: string }) => ({
      hall: entry.hallId, id: `${entry.id}.json`
    }))).toEqual(expectedRoutes);
  });

  it("retains both Akihabara data directories without publishing the mixed-only store", async () => {
    expect(getHall("akihabara")).toMatchObject({
      id: "akihabara", name: "萌えスロのお店", dataSubdir: "akihabara"
    });
    expect(getHall("akiba_espace")).toMatchObject({
      id: "akiba_espace", name: "電気街口のお店", dataSubdir: "akiba_espace"
    });
    expect(await getLiveMachine(fixture.id, "akiba_espace")).toBeUndefined();
    expect(getMachine).not.toHaveBeenCalled();
    const response = await machineGET(new Request("https://example.test/"), {
      params: Promise.resolve({ hall: "akiba_espace", id: `${fixture.id}.json` }),
    });
    expect(response.status).toBe(404);
  });

  it("does not publish pending halls, unavailable machines, or arbitrary paths", async () => {
    expect(await getLiveMachine(fixture.id, "akihabara")).toBeUndefined();
    expect(await getLiveMachine("../vvv2", "shinjuku")).toBeUndefined();
    expect(getMachine).not.toHaveBeenCalled();
    vi.mocked(getMachine).mockResolvedValue({ ...validateMachine(fixture), available: false });
    expect(await getLiveMachine(fixture.id, "shinjuku")).toBeUndefined();
    const response = await machineGET(new Request("https://example.test/"), {
      params: Promise.resolve({ hall: "shinjuku", id: "vvv2" })
    });
    expect(response.status).toBe(404);
  });

  it("removes withdrawn machines from the index and generated paths", async () => {
    vi.mocked(getAvailableMachines).mockResolvedValue([]);
    expect((await getLiveIndex()).machines).toEqual([]);
    expect(await generateStaticParams()).toEqual([]);
  });

  it("publishes collection-only routes and revisions without reading saved targets or invoking financial publication", async () => {
    const collection = collectedFixture();
    vi.mocked(getHallDisplay).mockResolvedValue({ kind: "collection", collection });
    vi.mocked(getHallDisplays).mockImplementation(async hall => hall === "kabuki" ? [{ kind: "collection", collection }] : []);
    const detail = await getLiveMachine(collection.summary.id, "kabuki");
    expect(detail).toEqual(buildLiveCollection(collection));
    expect(getSavedTargetCatalog).not.toHaveBeenCalled();
    expect(getSavedTargetSnapshot).not.toHaveBeenCalled();
    expect((await getLiveIndex()).machines).toEqual([liveIndexEntry("kabuki", detail!)]);
    expect(getSavedTargetSnapshot).not.toHaveBeenCalled();
    expect(await generateStaticParams()).toEqual([{ hall: "kabuki", id: `${collection.summary.id}.json` }]);
    expect(detail).not.toHaveProperty("savedTargets");
    expect(detail?.machine).not.toHaveProperty("profiles");
    expect(detail?.machine).not.toHaveProperty("economics");
  });

  it("reads saved targets under the selected raw ID when entering from an alias URL", async () => {
    const machine = validateMachine({ ...fixture, id: "m020bda5f", name: "スマスロパリピ孔明" });
    vi.mocked(getHallDisplay).mockResolvedValue({ kind: "machine", machine });
    const detail = await getLiveMachine("m4ab6796b", "kabuki");
    expect(detail?.machine.id).toBe(machine.id);
    expect(getSavedTargetSnapshot).toHaveBeenCalledExactlyOnceWith(machine.id, "kabuki", "kabuki");
    expect(detail).toEqual(buildLiveMachine(machine, "kabuki", catalog()));
  });
});
