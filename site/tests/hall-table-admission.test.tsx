import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assumedPayoutNotice, withoutLowSetting } from "../lib/ev/low-setting";
import type { Machine } from "../lib/ev/types";
import { assumedPayoutFixture } from "./fixtures/assumed-payout";
import { catalogFixture } from "./fixtures/collection-status";

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); }, useRouter: () => ({ push: vi.fn() }),
}));

const physicalHalls = ["shinjuku", "akihabara", "kabuki"] as const;
const subdir = (hall: string) => hall === "shinjuku" ? "" : hall;
let root: string;

async function writeMachine(machine: Machine, hall: string) {
  const dir = path.join(root, "data", "machines", subdir(hall));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${machine.id}.json`), JSON.stringify(machine));
}

async function writeObservation(machine: Machine, hall: string, forcePending = false) {
  const catalog = catalogFixture(machine.id, forcePending, hall);
  Object.assign(catalog, hall === "akihabara" ? { source: "site_seven", storeId: "00000001" } : {});
  Object.assign(catalog.machines[0], { name: machine.name, aliases: machine.aliases, reasonCode: "spec_unverified" });
  catalog.machines[0].sourceIntegrity.machineName = machine.name;
  const dir = path.join(root, "data", "halls", hall);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "collection-status.json"), JSON.stringify(catalog));
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "evlive-hall-admission-"));
  await fs.mkdir(path.join(root, "data", "machines"), { recursive: true });
  await fs.mkdir(path.join(root, "data", "saved-targets"), { recursive: true });
  await fs.writeFile(path.join(root, "data", "saved-targets", "targets.json"), JSON.stringify({
    schema: "evlive-saved-targets/v1", updatedAt: "2026-10-26T00:00:00Z", targets: [],
  }));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.resetModules();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe("per-hall numerical table admission", () => {
  it.each(physicalHalls)("keeps an eligible %s table ahead of collection fallback in detail and HTTP/index routes", async hall => {
    const { getHallDisplay, getHallDisplays, getMachine, getMachines } = await import("../lib/machines");
    const { getLiveMachine } = await import("../lib/live-data");
    const { GET: machineGET, generateStaticParams } = await import("../app/live-data/[hall]/[id]/route");
    const { GET: indexGET } = await import("../app/live-data/index.json/route");
    const { default: detailPage } = await import("../app/machines/[id]/[hall]/page");
    // Each hall has its own amounts and counts, so cross-hall substitution is observable.
    for (const [index, sourceHall] of physicalHalls.entries()) {
      const source = assumedPayoutFixture("m407111cd", sourceHall, (index + 1) * 100);
      if (sourceHall === "kabuki") source.calcSpec = { items: [{ k: "獲得", v: "この店舗で実測" }] };
      await writeMachine(source, sourceHall);
      await writeObservation(source, sourceHall);
    }
    const expected = assumedPayoutFixture("m407111cd", hall, (physicalHalls.indexOf(hall) + 1) * 100);
    const display = await getHallDisplay(expected.id, hall);
    expect(display?.kind).toBe("machine");
    expect(await getHallDisplays(hall)).toEqual([display]);
    const loaded = await getMachine(expected.id, subdir(hall));
    expect(await getMachines(subdir(hall))).toEqual([loaded]);
    expect(loaded?.profiles.map(({ key, sessions, baseAnchors, dataPending }) => ({ key, sessions, baseAnchors, dataPending })))
      .toEqual(expected.profiles.map(({ key, sessions, baseAnchors, dataPending }) => ({ key, sessions, baseAnchors, dataPending })));
    const response = await machineGET(new Request(`https://example.test/live-data/${hall}/${expected.id}.json`), {
      params: Promise.resolve({ hall, id: `${expected.id}.json` }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ schema: "evlive-live-machine/v1", machine: { id: expected.id, meta: expected.meta } });
    expect(payload.machine.profiles).toHaveLength(4);
    for (const profile of expected.profiles) expect(payload.machine.profiles.find((entry: { key: string }) => entry.key === profile.key))
      .toMatchObject({ sessions: profile.sessions, baseAnchors: profile.baseAnchors });
    const index = await (await indexGET()).json();
    expect(index.machines.find((entry: { hallId: string }) => entry.hallId === hall))
      .toMatchObject({ id: expected.id, revision: payload.revision, summary: { meta: expected.meta } });
    expect(await generateStaticParams()).toContainEqual({ hall, id: `${expected.id}.json` });
    const page = await detailPage({ params: Promise.resolve({ id: expected.id, hall }) });
    expect(page.props.initial).toEqual(await getLiveMachine(expected.id, hall));
    expect(page.props.initial.schema).toBe("evlive-live-machine/v1");
  });

  it.each(["m407111cd", "mfb4da289"])("publishes both rates and morning/main %s assumptions visibly without empirical payout features", async id => {
    const input = assumedPayoutFixture(id);
    await writeMachine(input, "shinjuku");
    await writeObservation(input, "shinjuku");
    const { default: detailPage } = await import("../app/machines/[id]/[hall]/page");
    const page = await detailPage({ params: Promise.resolve({ id, hall: "shinjuku" }) });
    const model = page.props.initial.machine as Machine;
    expect(model.profiles.map(profile => profile.key)).toEqual(input.profiles.map(profile => profile.key));
    expect(model.profiles.every(profile => profile.label.includes("獲得想定"))).toBe(true);
    expect(model).not.toHaveProperty("atPayout");
    expect(model).not.toHaveProperty("settingAim");
    expect(model).not.toHaveProperty("theoretical");
    expect(model.calcSpec?.items).toContainEqual(input.calcSpec!.items[1]);
    const html = renderToStaticMarkup(page);
    expect(html).toContain("想定獲得の期待値表");
    expect(html).toContain(id === "mfb4da289" ? "CZ当選G" : "AT当選G");
    expect(html).toContain("獲得枚数は公表設定1機械割から逆算した仮定");
    expect(html).not.toContain("期待値算出保留");
  });

  it.each(physicalHalls)("retains explicit forcePending in %s without borrowing another hall", async hall => {
    const input = assumedPayoutFixture("m407111cd", hall);
    if (hall === "kabuki") input.calcSpec = { items: [] };
    await writeMachine(input, hall);
    await writeObservation(input, hall, true);
    const { getHallDisplay } = await import("../lib/machines");
    const { getLiveMachine } = await import("../lib/live-data");
    expect((await getHallDisplay(input.id, hall))?.kind).toBe("collection");
    expect(await getLiveMachine(input.id, hall)).toMatchObject({ schema: "evlive-live-collection/v1", machine: { meta: { samples: "0" } } });
  });

  it("does not make a table when only another store has a generated model", async () => {
    const input = assumedPayoutFixture();
    await writeMachine(input, "shinjuku");
    await writeObservation(input, "akihabara");
    const { getLiveMachine } = await import("../lib/live-data");
    expect(await getLiveMachine(input.id, "akihabara")).toMatchObject({ schema: "evlive-live-collection/v1" });
    expect(await getLiveMachine(input.id, "kabuki")).toBeUndefined();
  });
});

describe("assumed payout model boundary", () => {
  it("requires an exact registered identity, source hall, generated profile scope and numerical rows", () => {
    const input = assumedPayoutFixture();
    expect(withoutLowSetting(input)).toBeNull();
    for (const hall of ["kabuki", "mixed", "mixed-raw", "new-store"]) expect(withoutLowSetting(input, hall)).toBeNull();
    for (const changed of [
      { ...input, id: "unknown" }, { ...input, name: `${input.name}II` },
      { ...input, profiles: input.profiles.map(profile => ({ ...profile, key: "unverified-profile" })) },
      { ...input, profiles: input.profiles.map(profile => ({ ...profile, dataPending: true, baseAnchors: [] })) },
      { ...input, officialCalibrationHold: {} as Machine["officialCalibrationHold"] },
      { ...input, mixedSources: { schemaVersion: 1 as const, halls: ["shinjuku"], inputSha256: "a".repeat(64) } },
    ]) expect(withoutLowSetting(changed, "shinjuku")).toBeNull();
  });

  it("keeps generated monetary values, source assumptions and pending profiles without mutating input", () => {
    const input = assumedPayoutFixture();
    input.profiles[1] = { ...input.profiles[1], dataPending: true, baseAnchors: [], pendingReason: "母数不足" };
    const before = structuredClone(input);
    const selected = withoutLowSetting(input, "akihabara")!;
    expect(selected.profiles.map(({ label: _label, ...profile }) => profile))
      .toEqual(input.profiles.map(({ label: _label, ...profile }) => profile));
    expect(assumedPayoutNotice(selected, "akihabara")).toContain("この店舗の実測");
    expect(selected.calcSpec?.items.map(item => item.k)).toEqual(["設定1（公表）機械割", "★獲得は実測ではない"]);
    expect(input).toEqual(before);
  });
});
