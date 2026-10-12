import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HallSelectClient } from "../app/machines/[id]/HallSelectClient";
import { MachineListClient } from "../app/machines/MachineListClient";
import { useLiveIndex } from "../lib/use-live-data";
import { selectMachineListSummaries } from "../lib/machine-list-summary";
import { getVisibleHalls } from "../lib/halls";
import { collectedFixture } from "./fixtures/collection-status";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../lib/use-live-data", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/use-live-data")>(), useLiveIndex: vi.fn(() => null),
}));

const pending = { ...collectedFixture("m4ab6796b").summary, name: "Lパリピ孔明" };
const numeric = { ...collectedFixture("m020bda5f").summary, name: "スマスロパリピ孔明", meta: { samples: "80", source: "歌舞伎" } };
const mixed = { ...numeric, meta: { samples: "302", source: "店舗混合" } };
const entries = [
  { hallId: "shinjuku", summary: pending }, { hallId: "kabuki", summary: numeric },
  { hallId: "mixed-raw", summary: mixed },
];

describe("source aliases in rendered navigation", () => {
  it("renders one SSR card with the published mixed total", () => {
    const html = renderToStaticMarkup(createElement(MachineListClient, { machines: selectMachineListSummaries(entries) }));
    expect(html).toContain("全1機種");
    expect(html).toContain("スマスロパリピ孔明");
    expect(html).not.toContain("Lパリピ孔明</");
  });

  it.each([false, true])("keeps each hall's samples and hold after an alias route, live=%s", live => {
    vi.mocked(useLiveIndex).mockReturnValue(live ? { schema: "evlive-live-index/v1",
      machines: [...entries, { hallId: "mixed-raw", summary: pending }].map(entry => ({
        ...entry, id: entry.summary.id, revision: "a".repeat(64),
      })) } : null);
    const html = renderToStaticMarkup(createElement(HallSelectClient, { machine: pending, hallMachines: entries }));
    const articles = [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].map(match => match[0]);
    const byHall = Object.fromEntries(getVisibleHalls().map((hall, index) => [hall.id, articles[index]]));
    expect(byHall.shinjuku).toContain("算出保留");
    expect(byHall.shinjuku).not.toContain("サンプル 80回");
    expect(byHall.kabuki).toContain("サンプル 80回");
    expect(byHall["mixed-raw"]).toContain("サンプル 302回");
    expect(byHall["mixed-raw"]).not.toContain("算出保留");
  });
});
