import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { validateMachine } from "../lib/ev/validate";
import { machineSummary } from "../lib/ev/summary";
import { getMachine, getMachineHallSummaries, getMachineIds, getHallDisplay } from "../lib/machines";
import { HALLS, getHall } from "../lib/halls";
import { getSavedTargetCatalog, getSavedTargetSnapshot } from "../lib/saved-target-catalog";
import MachineHallPage, { generateStaticParams as hallParams } from "../app/machines/[id]/page";
import MachineDetailPage, { generateStaticParams as detailParams } from "../app/machines/[id]/[hall]/page";
import { LiveMachineClient } from "../app/machines/[id]/MachineDetailClient";
import { HallPendingClient } from "../app/machines/[id]/[hall]/HallPendingClient";
import { collectedFixture } from "./fixtures/collection-status";

vi.mock("../lib/machines", () => ({
  getMachine: vi.fn(), getMachineIds: vi.fn(), getMachineHallSummaries: vi.fn(), getHallDisplay: vi.fn()
}));
vi.mock("../lib/saved-target-catalog", () => ({ getSavedTargetCatalog: vi.fn(), getSavedTargetSnapshot: vi.fn() }));
vi.mock("../app/machines/[id]/MachineDetailClient", () => ({ LiveMachineClient: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  useRouter: () => ({ push: vi.fn() })
}));

const mixed = validateMachine({ ...fixture, id: "mixedonly", meta: { ...fixture.meta, samples: "123" } });
const summaries = [{ hallId: "mixed", summary: machineSummary(mixed) }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMachineIds).mockResolvedValue(["ordinary", mixed.id]);
  vi.mocked(getMachine).mockImplementation(async (id, hall) => id === mixed.id && hall === "mixed" ? mixed : undefined);
  vi.mocked(getHallDisplay).mockImplementation(async (id, hallId) => {
    const machine = await getMachine(id, getHall(hallId)?.dataSubdir);
    return machine ? { kind: "machine", machine } : undefined;
  });
  vi.mocked(getMachineHallSummaries).mockImplementation(async (id) => id === mixed.id ? summaries : []);
  vi.mocked(getSavedTargetCatalog).mockResolvedValue({ schema: "evlive-saved-targets/v1", updatedAt: "2026-09-14T00:00:00Z", targets: [] });
  vi.mocked(getSavedTargetSnapshot).mockResolvedValue({ refreshed: [], replaySource: null });
});

describe("machines collected only outside the default hall", () => {
  it("exports the hall selector and all hall paths, including the live mixed endpoint's page", async () => {
    expect(await hallParams()).toContainEqual({ id: mixed.id });
    const params = await detailParams();
    for (const hall of HALLS) expect(params).toContainEqual({ id: mixed.id, hall: hall.id });
  });

  it("renders the mixed data without requiring a default-hall machine", async () => {
    const page = await MachineDetailPage({ params: Promise.resolve({ id: mixed.id, hall: "mixed" }) });
    expect(page.type).toBe(LiveMachineClient);
    expect(page.props.initial.machine).toEqual(mixed);
    expect(page.props.hall.id).toBe("mixed");
    expect(getMachine).toHaveBeenCalledExactlyOnceWith(mixed.id, "mixed");
    expect(getSavedTargetSnapshot).toHaveBeenCalledExactlyOnceWith(mixed.id, "mixed", "mixed");
    expect(getMachineHallSummaries).not.toHaveBeenCalled();
  });

  it("renders a catalog-only route with the same live collection payload and no financial dependencies", async () => {
    const collection = collectedFixture("newonly");
    vi.mocked(getHallDisplay).mockResolvedValue({ kind: "collection", collection });
    const page = await MachineDetailPage({ params: Promise.resolve({ id: "newonly", hall: "kabuki" }) });
    expect(page.type).toBe(LiveMachineClient);
    expect(page.props.initial).toMatchObject({ schema: "evlive-live-collection/v1", machine: collection.summary });
    expect(page.props.initial).not.toHaveProperty("savedTargets");
    expect(getSavedTargetSnapshot).not.toHaveBeenCalled();
  });

  it.each(["shinjuku", "akihabara"])("shows pending in %s instead of borrowing mixed data", async (hall) => {
    const page = await MachineDetailPage({ params: Promise.resolve({ id: mixed.id, hall }) });
    expect(page.type).toBe(HallPendingClient);
    expect(page.props.hall.id).toBe(hall);
    expect(page.props.machine).not.toHaveProperty("profiles");
    expect(getSavedTargetCatalog).not.toHaveBeenCalled();
  });

  it("shows initial sample counts only under the hall that supplied them", async () => {
    const page = await MachineHallPage({ params: Promise.resolve({ id: mixed.id }) });
    const html = renderToStaticMarkup(page);
    const articles = [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].map((match) => match[0]);
    expect(articles).toHaveLength(HALLS.length);
    for (const [index, hall] of HALLS.entries()) {
      if (hall.id === "mixed") {
        expect(articles[index]).toContain("サンプル 123回");
        expect(articles[index]).toContain("データあり");
      } else {
        expect(articles[index]).not.toMatch(/サンプル\s+[\d,]+回/);
        expect(articles[index]).toContain("準備中");
      }
    }
  });

  it("still rejects unknown machines and halls", async () => {
    await expect(MachineHallPage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow("NOT_FOUND");
    await expect(MachineDetailPage({ params: Promise.resolve({ id: "missing", hall: "mixed" }) })).rejects.toThrow("NOT_FOUND");
    await expect(MachineDetailPage({ params: Promise.resolve({ id: mixed.id, hall: "unknown" }) })).rejects.toThrow("NOT_FOUND");
  });
});
