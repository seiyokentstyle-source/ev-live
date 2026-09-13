import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { validateMachine } from "../lib/ev/validate";
import { getAvailableMachines, getMachine } from "../lib/machines";
import { getSavedTargetCatalog, getSavedTargetRefreshes } from "../lib/saved-target-catalog";
import { buildLiveMachine, getLiveIndex, getLiveMachine, liveIndexEntry } from "../lib/live-data";
import { GET as indexGET } from "../app/live-data/index.json/route";
import { GET as machineGET, generateStaticParams } from "../app/live-data/[hall]/[id]/route";
import type { PublishedTarget, SavedTargetCatalog } from "../lib/saved-targets.mjs";

vi.mock("../lib/machines", () => ({ getAvailableMachines: vi.fn(), getMachine: vi.fn() }));
vi.mock("../lib/saved-target-catalog", () => ({ getSavedTargetCatalog: vi.fn(), getSavedTargetRefreshes: vi.fn() }));

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
  vi.mocked(getSavedTargetCatalog).mockResolvedValue(catalog());
  vi.mocked(getSavedTargetRefreshes).mockResolvedValue([]);
});

describe("live data publication", () => {
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
    // 低設定想定店舗混合は ready=true で、設定1想定を持つ機種だけが並ぶ。
    // 店舗が増えればここも増える＝ready の店舗×機種ぶんのルートが出る、を固定する。
    expect(await generateStaticParams()).toEqual([
      { hall: "shinjuku", id: `${fixture.id}.json` },
      { hall: "mixed", id: `${fixture.id}.json` }
    ]);
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
});
