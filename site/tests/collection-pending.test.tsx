import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { validateMachine } from "../lib/ev/validate";
import { machineSummary } from "../lib/ev/summary";
import { MachineCard } from "../components/machine-list/MachineCard";
import { MachineDetailClient } from "../app/machines/[id]/MachineDetailClient";
import { HallSelectClient } from "../app/machines/[id]/HallSelectClient";
import { ConditionsBar } from "../components/ev/ConditionsBar";
import { HALLS } from "../lib/halls";
import type { Machine } from "../lib/ev/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const reason = "収集済みですが、通常時・ATと獲得枚数の対応を確認できないため期待値算出を保留しています。";
const status = "収集済み 2,033行 / 期待値算出保留";
const hall = HALLS.find(item => item.id === "shinjuku")!;

function pendingMachine(): Machine {
  const machine = validateMachine(structuredClone(fixture));
  machine.meta = {
    samples: "0", source: "実戦データ自動収集（2026-09-07〜2026-09-07・全データ）",
    collection: { rows: 2033, events: 2014, units: 19, days: 1, firstDate: "2026-09-07", lastDate: "2026-09-07" }
  };
  machine.profiles = machine.profiles.map(profile => ({ ...profile, baseAnchors: [], zones: [], sessions: 0, dataPending: true, pendingReason: reason }));
  machine.calcSpec = { items: [{ k: "公表純増", v: "ボーナス中 約8.4枚/G" }] };
  return validateMachine(machine);
}

describe("collected history awaiting counter interpretation", () => {
  it("preserves collection metadata through validation and the compact list payload", () => {
    const machine = pendingMachine();
    expect(machineSummary(machine).meta).toEqual(machine.meta);
    expect(machine.meta.samples).toBe("0");
    expect(machine.profiles[0].pendingReason).toBe(reason);
  });

  it("shows saved rows rather than calling them EV samples on the machine card", () => {
    const html = renderToStaticMarkup(<MachineCard machine={pendingMachine()} isFavorite={false} match={{ type: "none" }} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect(html).toContain(status);
    expect(html).not.toContain("サンプル");
  });

  it("shows signal count, saved rows and date coverage in the conditions summary", () => {
    const html = renderToStaticMarkup(<ConditionsBar machine={pendingMachine()} mode="ev" profileSessions={0} />);
    expect(html).toContain("信号 2,014件・保存 2,033行・19台・1日");
    expect(html).toContain("公表仕様");
    expect(html).not.toContain("サンプル");
    expect(html).not.toContain("時給換算");
  });

  it("keeps a pending hall accessible but excludes it from calculated hall counts", () => {
    const machine = machineSummary(pendingMachine());
    const html = renderToStaticMarkup(<HallSelectClient machine={machine} hallMachines={[{ hallId: hall.id, summary: machine }]} />);
    expect(html).toContain(status);
    expect(html).toContain("集計済み0店舗");
    expect(html).not.toContain("データあり");
    expect(html).not.toContain("サンプル 0件");
  });

  it("renders the reason and suppresses EV, payout, setting and saved-target controls even if stale numeric attachments remain", () => {
    const machine = pendingMachine();
    machine.theoretical = { label: "stale-theory", note: "stale", source: "stale", firstHitG: 100, avgPayout: 99999, ceiling: 1000, gRange: { start: 0, end: 1000, step: 50 }, baseAnchors: [] };
    machine.settingAim = { label: "stale-setting", unit: "%", note: "stale", dates: [], units: [{ unit: "1", avg: 99999, days: 0, rates: [], net: 99999 }] };
    machine.atPayout = { step: 50, label: "stale-payout", note: "stale", bands: [{ lo: 0, hi: 50, count: 1, mean: 99999, median: 99999 }] };
    const html = renderToStaticMarkup(<MachineDetailClient machine={machine} hall={hall} />);
    expect(html).toContain(status);
    expect(html).toContain(reason);
    expect(html).not.toContain("<table");
    expect(html).not.toContain("99999");
    expect(html).not.toContain("stale-");
    expect(html).not.toContain("全体平均");
    expect(html).not.toContain("設定狙い");
    expect(html).not.toContain("AT獲得");
    expect(html).not.toContain("狙い目");
  });

  it("keeps the original no-data fallback and accepts a reason without collection metadata", () => {
    const machine = pendingMachine();
    delete machine.meta.collection;
    machine.profiles = machine.profiles.map(({ pendingReason: _reason, ...profile }) => profile);
    const oldHtml = renderToStaticMarkup(<MachineDetailClient machine={machine} hall={hall} />);
    expect(oldHtml).toContain("実戦データはまだありません");
    machine.profiles = machine.profiles.map(profile => ({ ...profile, pendingReason: reason }));
    const newHtml = renderToStaticMarkup(<MachineDetailClient machine={machine} hall={hall} />);
    expect(newHtml).toContain(reason);
    expect(newHtml).not.toContain("実戦データはまだありません");
  });

  it("rejects invalid collection counts instead of presenting them as evidence", () => {
    const machine = pendingMachine();
    machine.meta.collection!.events = 3000;
    expect(() => validateMachine(machine)).toThrow("events must not exceed rows");
    machine.meta.collection!.events = -1;
    expect(() => validateMachine(machine)).toThrow("events must be a non-negative integer");
  });
});
