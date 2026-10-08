import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { onlyLowSetting, withoutLowSetting } from "../lib/ev/low-setting";
import { validateMachine } from "../lib/ev/validate";
import { normalizeSearchText } from "../lib/search/normalize";
import { catalogFixture, collectedFixture } from "./fixtures/collection-status";
import { referenceFixture } from "./fixtures/provisional-setting1";
import { estimateFixture } from "./fixtures/counter-estimate";
import { getRegisteredProvisionalSetting1 } from "../lib/ev/provisional-setting1";

let root: string;
let getMachine: typeof import("../lib/machines").getMachine;
let getMachines: typeof import("../lib/machines").getMachines;
let getMachineIds: typeof import("../lib/machines").getMachineIds;
let getMachineHallSummaries: typeof import("../lib/machines").getMachineHallSummaries;
let getHallDisplay: typeof import("../lib/machines").getHallDisplay;
let getHallDisplays: typeof import("../lib/machines").getHallDisplays;
let getMachineListSummaries: typeof import("../lib/machines").getMachineListSummaries;

function machine(id = "target") {
  const data = structuredClone(fixture);
  data.id = id;
  if (id === "lycoris" || id === "worlddai") data.name = collectedFixture(id).summary.name;
  data.aliases = ["nickname"];
  data.profiles = [
    { ...data.profiles[0], key: "measured", label: "実測" },
    { ...data.profiles[0], key: "estimated", label: "設定1想定" }
  ];
  return data;
}

function pendingMachine(id = "worlddai") {
  const input = machine(id);
  return validateMachine({ ...input, meta: collectedFixture(id).summary.meta,
    profiles: input.profiles.slice(0, 1).map(({ ev: _ev, ...profile }) => ({ ...profile, baseAnchors: [], zones: [], dataPending: true, sessions: 0 })) });
}

function correctionMachine(id = "target", lastUpdated = "2026-09-07", ev = -2400) {
  const base = machine(id);
  const measured = [
    structuredClone(base.profiles[0]),
    { ...structuredClone(base.profiles[0]), key: "morning", label: "朝一" },
  ];
  return {
    ...base,
    lastUpdated,
    profiles: [...measured, base.profiles[1]],
    setting1Correction: {
      schemaVersion: 1 as const, sourceHallId: "shinjuku" as const,
      targetRtp: 0.977, payoutScale: 0.938, method: "payout-scale" as const,
      profiles: measured.map((profile, index) => ({
        ...structuredClone(profile),
        baseAnchors: profile.baseAnchors.map((anchor) => ({
          ...anchor, ev: ev - index * 100, rtp: 95.5,
        })),
      })),
    },
  };
}

async function writeMachine(id: string, data: unknown = machine(id), subdir = "") {
  const dir = path.join(root, "data", "machines", subdir);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(data));
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "evlive-machine-test-"));
  await fs.mkdir(path.join(root, "data", "machines"), { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.resetModules();
  ({ getMachine, getMachines, getMachineIds, getMachineHallSummaries, getHallDisplay, getHallDisplays, getMachineListSummaries } = await import("../lib/machines"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

async function writeCatalog(id = "held", forcePending = false, hallId = "kabuki", unknown = false) {
  const dir = path.join(root, "data", "halls", hallId);
  await fs.mkdir(dir, { recursive: true });
  const catalog = catalogFixture(id, forcePending, hallId);
  if (unknown) Object.assign(catalog.machines[0], { releaseDate: null, manufacturer: "未確認" });
  await fs.writeFile(path.join(dir, "collection-status.json"), JSON.stringify(catalog));
}

describe("collection fallback selection", () => {
  it("adds a registered reference to saved pending machines without modifying their stored JSON or counts", async () => {
    const input = pendingMachine();
    await writeMachine(input.id, input, "kabuki");
    const file = path.join(root, "data", "machines", "kabuki", `${input.id}.json`);
    const before = await fs.readFile(file, "utf8");
    const display = await getHallDisplay(input.id, "kabuki");
    expect(display).toEqual({ kind: "machine", machine: { ...input,
      provisionalSetting1: getRegisteredProvisionalSetting1(input.id, input.name) } });
    expect(await getHallDisplays("kabuki")).toEqual([display]);
    expect(await getMachine(input.id, "kabuki")).toEqual(input);
    expect(await fs.readFile(file, "utf8")).toBe(before);
    expect(await getHallDisplay(input.id, "shinjuku")).toBeUndefined();
    expect(await getHallDisplay(input.id, "akihabara")).toBeUndefined();
  });

  it.each(["shinjuku", "kabuki"])("adds a catalog-only reference in its observed %s hall and keeps the live detail consistent", async hall => {
    await writeCatalog("worlddai", false, hall);
    const display = await getHallDisplay("worlddai", hall);
    expect(display).toMatchObject({ kind: "collection", collection: { summary: { id: "worlddai", name: "ワールドダイスター",
      meta: { samples: "0", collection: collectedFixture("worlddai").summary.meta.collection } } },
      provisionalSetting1: getRegisteredProvisionalSetting1("worlddai", "ワールドダイスター") });
    expect(await getHallDisplays(hall)).toEqual([display]);
    const { getLiveMachine, getLiveIndex } = await import("../lib/live-data");
    const live = await getLiveMachine("worlddai", hall);
    expect(live).toMatchObject({ schema: "evlive-live-collection/v1",
      machine: display?.kind === "collection" ? display.collection.summary : undefined,
      provisionalSetting1: getRegisteredProvisionalSetting1("worlddai", "ワールドダイスター") });
    expect(live?.machine).not.toHaveProperty("profiles");
    await fs.mkdir(path.join(root, "data", "saved-targets"), { recursive: true });
    await fs.writeFile(path.join(root, "data", "saved-targets", "targets.json"), JSON.stringify({
      schema: "evlive-saved-targets/v1", updatedAt: "2026-10-09T00:00:00.000Z", targets: [],
    }));
    expect((await getLiveIndex()).machines.find(entry => entry.hallId === hall)?.revision).toBe(live?.revision);
    expect(await getHallDisplay("worlddai", hall === "shinjuku" ? "kabuki" : "shinjuku")).toBeUndefined();
    expect(await getHallDisplay("worlddai", "mixed")).toBeUndefined();
  });

  it("keeps measured tables and estimates ahead of a public reference while respecting forcePending", async () => {
    const measured = machine("worlddai");
    await writeMachine(measured.id, measured, "kabuki");
    await writeCatalog(measured.id);
    let display = await getHallDisplay(measured.id, "kabuki");
    expect(display?.kind === "machine" && display.machine).not.toHaveProperty("provisionalSetting1");
    await writeCatalog(measured.id, true);
    display = await getHallDisplay(measured.id, "kabuki");
    expect(display).toMatchObject({ kind: "collection", provisionalSetting1: getRegisteredProvisionalSetting1(measured.id, measured.name) });
    expect(display).not.toHaveProperty("machine");
    expect(await getHallDisplays("kabuki")).toEqual([display]);
    const estimated = { ...pendingMachine("lycoris"), counterEstimate: estimateFixture() };
    await writeMachine(estimated.id, estimated);
    expect(await getHallDisplay(estimated.id, "shinjuku")).toMatchObject({ kind: "machine", machine: estimated });
    await writeCatalog(estimated.id, true, "shinjuku");
    display = await getHallDisplay(estimated.id, "shinjuku");
    expect(display).toMatchObject({ kind: "collection", counterEstimate: estimated.counterEstimate });
    expect(display).not.toHaveProperty("provisionalSetting1");
  });

  it("does not attach a reference to an unregistered identity, an empty collection or a non-pending profile", async () => {
    const base = pendingMachine();
    for (const input of [
      { ...base, name: "ワールドダイスターII" },
      { ...base, id: "unknown" },
      { ...base, meta: { ...base.meta, samples: "1" } },
      { ...base, meta: { samples: "0", source: "未取得" } },
      { ...base, meta: { ...base.meta, collection: { ...base.meta.collection!, rows: 0, events: 0 } } },
      { ...base, profiles: base.profiles.map(profile => ({ ...profile, dataPending: false,
        baseAnchors: [{ g: 0, ev: -100, rtp: 99 }, { g: 10, ev: 100, rtp: 101 }] })) },
    ]) {
      await writeMachine(input.id, input, "kabuki");
      const display = await getHallDisplay(input.id, "kabuki");
      expect(display?.kind === "machine" && display.machine).not.toHaveProperty("provisionalSetting1");
    }
    await writeCatalog("worlddai", true);
    const file = path.join(root, "data", "halls", "kabuki", "collection-status.json");
    const catalog = catalogFixture("worlddai", true);
    Object.assign(catalog.machines[0].collection, { rows: 0, events: 0 });
    await fs.writeFile(file, JSON.stringify(catalog));
    expect(await getHallDisplay("worlddai", "kabuki")).not.toHaveProperty("provisionalSetting1");
  });

  it("keeps a separately validated reference when an explicit hold overrides the machine, without copying it to another hall", async () => {
    const input = machine("lycoris");
    input.meta.samples = "0";
    input.profiles = input.profiles.map(profile => ({ ...profile, baseAnchors: [], zones: [], dataPending: true, sessions: 0 }));
    const reference = referenceFixture("lycoris");
    await writeMachine("lycoris", { ...input, provisionalSetting1: reference }, "kabuki");
    await writeCatalog("lycoris", true);
    const selected = await getHallDisplay("lycoris", "kabuki");
    expect(selected).toMatchObject({ kind: "collection", provisionalSetting1: reference, collection: { summary: { meta: { samples: "0" } } } });
    expect(await getHallDisplays("kabuki")).toEqual([selected]);
    expect(await getHallDisplay("lycoris", "shinjuku")).toBeUndefined();
    expect((await getMachineHallSummaries("lycoris"))[0].summary).not.toHaveProperty("provisionalSetting1");
  });
  it("shows a counter estimate only for the hall whose history produced it", async () => {
    const input = machine("lycoris");
    input.meta.samples = "0";
    input.profiles = input.profiles.map(profile => ({ ...profile, baseAnchors: [], zones: [], dataPending: true, sessions: 0 }));
    const estimate = estimateFixture();
    await writeMachine("lycoris", { ...input, counterEstimate: estimate });
    await writeMachine("lycoris", { ...input, counterEstimate: estimate }, "kabuki");
    expect((await getMachine("lycoris"))?.counterEstimate).toEqual(estimate);
    expect(await getMachine("lycoris", "kabuki")).not.toHaveProperty("counterEstimate");
    expect((await getMachines("kabuki"))[0]).not.toHaveProperty("counterEstimate");
    for (const machine of await getMachines("mixed")) expect(machine).not.toHaveProperty("counterEstimate");
    expect(await getMachine("lycoris", "mixed")).not.toHaveProperty("counterEstimate");
  });
  it("shows each hall's regenerated Lycoris profiles and selects the mixed correction without reusing Shinjuku", async () => {
    const base = machine("lycoris");
    const profileKeys = ["reset", "after_kake", "after_other"];
    const profiles = profileKeys.flatMap((key, index) => ["4652", "5050"].map(rate => ({
      ...structuredClone(base.profiles[0]), key: `${key}_${rate}`,
      label: `${key}（推定）・${rate === "4652" ? "46/52" : "50/50"}`,
      baseAnchors: base.profiles[0].baseAnchors.map(anchor => ({ ...anchor, ev: 100 + index, rtp: 101 })),
    })));
    const input = { ...base, meta: { ...base.meta, samples: "100" }, profiles,
      calcSpec: { items: [{ k: "推定獲得枚数", v: "同じモデルを各店舗の履歴へ適用。平均設定2.3は補正前の仮定" }] } };
    const combined = {
      ...input, mixedSources: { schemaVersion: 1, halls: ["shinjuku", "kabuki"], inputSha256: "c".repeat(64) },
      meta: { ...input.meta, samples: "300" },
      profiles: profiles.map(profile => ({ ...profile,
        baseAnchors: profile.baseAnchors.map(anchor => ({ ...anchor, ev: 222, rtp: 102 })) })),
      setting1Correction: { schemaVersion: 1, sourceHallId: "mixed", targetRtp: 0.979,
        payoutScale: 0.97, method: "payout-scale",
        profiles: profiles.map(profile => ({ ...profile,
          baseAnchors: profile.baseAnchors.map(anchor => ({ ...anchor, ev: -333, rtp: 99 })) })),
      },
    };
    await writeMachine("lycoris", input, "kabuki");
    await writeMachine("lycoris", combined, "mixed");
    await writeCatalog("lycoris");
    for (const [hall, expectedEv, expectedSamples] of [["kabuki", 100, "100"], ["mixed-raw", 222, "300"], ["mixed", -333, "300"]] as const) {
      const display = await getHallDisplay("lycoris", hall);
      expect(display?.kind).toBe("machine");
      if (display?.kind !== "machine") throw new Error(`missing numeric ${hall}`);
      expect(display.machine.profiles.map(profile => profile.key)).toEqual(profiles.map(profile => profile.key));
      expect(display.machine.profiles[0].baseAnchors[0].ev).toBe(expectedEv);
      expect(display.machine.meta.samples).toBe(expectedSamples);
      expect(display.machine).not.toHaveProperty("counterEstimate");
      expect(display.machine).not.toHaveProperty("provisionalSetting1");
      expect(display.machine.calcSpec?.items.map(item => item.v).join(" ")).toContain("補正前の仮定");
    }
    expect(await getHallDisplay("lycoris", "shinjuku")).toBeUndefined();
    expect((await getMachineHallSummaries("lycoris")).map(item => item.hallId)).toEqual(["kabuki", "mixed", "mixed-raw"]);
  });
  it.each(["shinjuku", "kabuki"])("publishes newly observed unknown machines from a %s catalog without any numeric JSON", async hallId => {
    await writeCatalog("futuremachine", false, hallId, true);
    expect(await getMachineIds()).toEqual(["futuremachine"]);
    expect(await getMachineListSummaries()).toMatchObject([{ id: "futuremachine", manufacturer: "未確認", releaseDate: null, summaryHallId: hallId }]);
    expect(await getMachineHallSummaries("futuremachine")).toMatchObject([{ hallId, summary: { id: "futuremachine", releaseDate: null } }]);
    expect(await getHallDisplay("futuremachine", hallId)).toMatchObject({ kind: "collection" });
    expect(await getHallDisplay("futuremachine", hallId === "shinjuku" ? "kabuki" : "shinjuku")).toBeUndefined();
    expect(await fs.readdir(path.join(root, "data", "machines"))).toEqual([]);
  });
  it("adds catalog-only machines to routes, lists and their own hall without borrowing another hall", async () => {
    await writeMachine("held");
    await writeCatalog();
    expect(await getHallDisplay("held", "kabuki")).toMatchObject({ kind: "collection", collection: { summary: { meta: { samples: "0" } } } });
    expect(await getHallDisplay("held", "shinjuku")).toMatchObject({ kind: "machine" });
    expect(await getHallDisplay("held", "akihabara")).toBeUndefined();
    expect(await getHallDisplays("kabuki")).toHaveLength(1);
    expect(await getMachineIds()).toEqual(["held"]);
    expect((await getMachineHallSummaries("held")).map(item => item.hallId)).toEqual(["shinjuku", "kabuki", "mixed"]);
    expect((await getMachineListSummaries())[0]).toMatchObject({ id: "held", summaryHallId: "shinjuku" });
    await writeCatalog("newonly");
    expect((await getMachineIds()).sort()).toEqual(["held", "newonly"]);
    expect((await getMachineListSummaries()).find(item => item.id === "newonly")).toMatchObject({ summaryHallId: "kabuki" });
  });

  it("keeps usable numeric data above stale fallback, but honors an explicit review hold without changing stored numbers", async () => {
    await writeMachine("held", machine("held"), "kabuki");
    await writeCatalog();
    const file = path.join(root, "data", "machines", "kabuki", "held.json");
    const before = await fs.readFile(file, "utf8");
    expect(await getHallDisplay("held", "kabuki")).toMatchObject({ kind: "machine" });
    expect((await getHallDisplays("kabuki"))[0]).toMatchObject({ kind: "machine" });
    await writeCatalog("held", true);
    expect(await getHallDisplay("held", "kabuki")).toMatchObject({ kind: "collection" });
    expect((await getHallDisplays("kabuki"))[0]).toMatchObject({ kind: "collection" });
    expect(await fs.readFile(file, "utf8")).toBe(before);
    expect(await getMachine("held", "kabuki")).toHaveProperty("profiles");
  });

  it("shows collection facts for assumed-payout-only actual-hall data while retaining the mixed model", async () => {
    const assumed = { ...machine("mfb4da289"), calcSpec: { items: [{ k: "獲得は実測ではない", v: "推定" }] } };
    await writeMachine(assumed.id, assumed, "kabuki");
    await writeMachine(assumed.id, assumed, "mixed");
    await writeCatalog(assumed.id);
    expect(await getMachine(assumed.id, "kabuki")).toBeUndefined();
    expect(await getHallDisplay(assumed.id, "kabuki")).toMatchObject({ kind: "collection" });
    expect(await getHallDisplay(assumed.id, "mixed")).toMatchObject({ kind: "machine" });
    expect((await getMachineHallSummaries(assumed.id)).map(item => item.hallId)).toEqual(["kabuki", "mixed"]);
  });
});

describe("single-machine data loading", () => {
  it("loads just the requested JSON even if an unrelated machine is invalid", async () => {
    const input = machine();
    await writeMachine("target", input);
    await fs.writeFile(path.join(root, "data", "machines", "broken.json"), "invalid JSON");
    const read = vi.spyOn(fs, "readFile");
    const list = vi.spyOn(fs, "readdir");

    expect(await getMachine("target")).toEqual(withoutLowSetting(validateMachine(input)));
    expect(read).toHaveBeenCalledTimes(1);
    expect(list).not.toHaveBeenCalled();
  });

  it("returns the same selected machine as the sorted, filtered list in each hall", async () => {
    await writeMachine("target");
    await writeMachine("other");
    await writeMachine("target", machine(), "akihabara");
    for (const hall of [undefined, "", "akihabara", "mixed"]) {
      expect(await getMachine("target", hall)).toEqual((await getMachines(hall)).find((item) => item.id === "target"));
    }
  });

  it("returns undefined for missing machines and uncollected halls", async () => {
    await writeMachine("target");
    expect(await getMachine("missing")).toBeUndefined();
    expect(await getMachine("target", "uncollected")).toBeUndefined();
  });

  it("does not interpret aliases as machine IDs or return a mismatched JSON", async () => {
    await writeMachine("target");
    await writeMachine("wrong", machine("different"));
    expect(await getMachine("nickname")).toBeUndefined();
    expect(await getMachine("wrong")).toBeUndefined();
  });

  it.each(["", "../target", "..\\target", "/target", "C:\\target", "target.json", "target:other", "target\u0000"])(
    "rejects an unsafe machine ID %j before reading files",
    async (id) => {
      const read = vi.spyOn(fs, "readFile");
      expect(await getMachine(id)).toBeUndefined();
      expect(read).not.toHaveBeenCalled();
    }
  );

  it.each(["../other", "..\\other", "/other", "C:\\other", "other:stream"])(
    "rejects an unsafe hall directory %j before reading files",
    async (subdir) => {
      const read = vi.spyOn(fs, "readFile");
      expect(await getMachine("target", subdir)).toBeUndefined();
      expect(read).not.toHaveBeenCalled();
    }
  );

  it("still rejects malformed JSON and invalid requested machine data", async () => {
    const file = path.join(root, "data", "machines", "target.json");
    await fs.writeFile(file, "invalid JSON");
    await expect(getMachine("target")).rejects.toThrow(SyntaxError);
    await fs.writeFile(file, JSON.stringify({ id: "target" }));
    await expect(getMachine("target")).rejects.toThrow("Invalid machine data");
  });

  it("propagates read failures instead of treating them as missing data", async () => {
    const failure = Object.assign(new Error("Access denied"), { code: "EACCES" });
    vi.spyOn(fs, "readFile").mockRejectedValueOnce(failure);
    await expect(getMachine("target")).rejects.toBe(failure);
  });
});

describe("SAO metadata separation", () => {
  it.each(["", "mixed"])("separates sequel search and dates in lists and details for hall %j", async (hall) => {
    const original = {
      ...machine("m49d497e0"), name: "Lソードアート・オンライン",
      aliases: ["Lソードアート・オンライン", "SAO2", "ソードアートオンライン2"],
      releaseDate: "2026-06-08",
    };
    const sequel = {
      ...machine("mfb4da289"), name: "ソードアート・オンラインII",
      aliases: ["ソードアート・オンラインII", "SAO2", "ソードアートオンライン2"],
      releaseDate: "2026-06-08", meta: { ...original.meta, samples: "4,373" },
    };
    await writeMachine(original.id, original, hall);
    await writeMachine(sequel.id, sequel, hall);
    const listed = await getMachines(hall);
    for (const query of ["SAO2", "SAOⅡ", "ソードアートオンライン2", "ソードアート・オンラインⅡ"]) {
      const matches = listed.filter((item) => [item.name, ...item.aliases].some((name) =>
        normalizeSearchText(name).includes(normalizeSearchText(query))));
      expect(matches.map((item) => item.id)).toEqual([sequel.id]);
    }
    for (const input of [original, sequel]) {
      const actual = await getMachine(input.id, hall);
      expect(actual).toEqual(listed.find((item) => item.id === input.id));
      const { aliases: _aliases, releaseDate: _date, ...unchanged } = actual!;
      const selected = hall ? validateMachine(input) : withoutLowSetting(validateMachine(input));
      const { aliases: _oldAliases, releaseDate: _oldDate, ...expected } = selected!;
      expect(unchanged).toEqual(expected);
    }
    expect((await getMachine(original.id, hall))?.releaseDate).toBe("2023-05-15");
    expect((await getMachine(sequel.id, hall))?.releaseDate).toBe("2026-06-08");
    expect(JSON.parse(await fs.readFile(path.join(root, "data", "machines", hall, `${original.id}.json`), "utf8"))).toEqual(original);
  });

  it("requires both ID and exact name before applying a known machine's metadata", async () => {
    for (const input of [
      { ...machine("m49d497e0"), name: "ソードアート・オンラインIII" },
      { ...machine("future"), name: "Lソードアート・オンライン" },
    ]) {
      await writeMachine(input.id, input);
      expect(await getMachine(input.id)).toEqual(withoutLowSetting(validateMachine(input)));
    }
  });
});

describe("low-setting hall selection", () => {
  it("includes mixed-only machines in the route IDs and keeps summary counts attached to their hall", async () => {
    await writeMachine("target");
    const input = { ...machine("mixedonly"), calcSpec: { items: [{ k: "獲得は実測ではない", v: "推定" }] } };
    await writeMachine("mixedonly", input);
    expect((await getMachineIds()).sort()).toEqual(["mixedonly", "target"]);
    const summaries = await getMachineHallSummaries("mixedonly");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ hallId: "mixed", summary: { id: "mixedonly", meta: input.meta } });
    expect(summaries[0].summary).not.toHaveProperty("profiles");
  });

  it("derives only estimated profiles from the default hall when mixed is absent", async () => {
    const input = machine();
    await writeMachine("target", input);
    expect(await getMachine("target", "mixed")).toEqual(onlyLowSetting(validateMachine(input)));
    expect((await getMachine("target", "mixed"))?.profiles.map((profile) => profile.key)).toEqual(["estimated"]);
  });

  it.each([false, true])(
    "loads the full correction bundle consistently with physical mixed folder=%s and preserves Shinjuku",
    async (physicalMixed) => {
      const base = machine();
      const input = correctionMachine();
      const measured = input.profiles.slice(0, 2);
      await writeMachine("target", input);
      const rootFile = path.join(root, "data", "machines", "target.json");
      const rootBefore = await fs.readFile(rootFile, "utf8");
      let selected = input.setting1Correction.profiles;
      let mixedFile: string | undefined;
      let mixedBefore: string | undefined;
      if (physicalMixed) {
        // A newer stored bundle must still be normalized and retained.
        const physical = correctionMachine("target", "2026-09-08", -3600);
        selected = physical.setting1Correction.profiles;
        await writeMachine("target", physical, "mixed");
        mixedFile = path.join(root, "data", "machines", "mixed", "target.json");
        mixedBefore = await fs.readFile(mixedFile, "utf8");
      }

      const mixed = await getMachine("target", "mixed");
      expect(await getMachines("mixed")).toEqual([mixed]);
      expect(mixed?.profiles).toEqual(selected);
      expect(mixed?.profiles.map((profile) => profile.key)).toEqual(["measured", "morning"]);
      expect(mixed?.profiles[0].baseAnchors[0].ev).toBe(physicalMixed ? -3600 : -2400);
      expect(mixed?.profiles[1].baseAnchors[0].ev).toBe(physicalMixed ? -3700 : -2500);
      expect(mixed).not.toHaveProperty("setting1Correction");

      const shinjuku = await getMachine("target");
      expect(await getMachines()).toEqual([shinjuku]);
      expect(shinjuku?.profiles).toEqual(measured);
      expect(shinjuku?.profiles[0].baseAnchors[0].ev).toBe(base.profiles[0].baseAnchors[0].ev);
      expect(shinjuku).not.toHaveProperty("setting1Correction");
      expect(await fs.readFile(rootFile, "utf8")).toBe(rootBefore);
      if (mixedFile) expect(await fs.readFile(mixedFile, "utf8")).toBe(mixedBefore);
    },
  );

  it.each(["2026-09-07", "2026-09-08"])(
    "prefers a source bundle dated %s to a stored correction dated 2026-09-07",
    async (date) => {
      const input = correctionMachine("target", date, -1700);
      input.meta.samples = "222";
      const stored = onlyLowSetting(validateMachine(correctionMachine("target", "2026-09-07", -3600)))!;
      await writeMachine("target", input);
      await writeMachine("target", stored, "mixed");

      const selected = await getMachine("target", "mixed");
      expect(selected).toEqual(onlyLowSetting(validateMachine(input)));
      expect(await getMachines("mixed")).toEqual([selected]);
      expect(selected?.profiles).toEqual(input.setting1Correction.profiles);
      expect(selected).toMatchObject({ lastUpdated: date, meta: { samples: "222" } });
      expect(selected).not.toHaveProperty("setting1Correction");
      expect((await getMachine("target"))?.profiles).toEqual(input.profiles.slice(0, 2));
    },
  );

  it.each(["absent", "newer-without-bundle", "older-bundle"])(
    "keeps the stored correction when the source is %s",
    async (sourceState) => {
      const stored = onlyLowSetting(validateMachine(correctionMachine("target", "2026-09-07", -3600)))!;
      if (sourceState === "newer-without-bundle") {
        const legacy = machine();
        legacy.lastUpdated = "2026-09-08";
        await writeMachine("target", legacy);
      } else if (sourceState === "older-bundle") {
        await writeMachine("target", correctionMachine("target", "2026-09-06", -1700));
      }
      await writeMachine("target", stored, "mixed");

      const selected = await getMachine("target", "mixed");
      expect(selected).toEqual(stored);
      expect(await getMachines("mixed")).toEqual([selected]);
      expect(selected?.profiles[0].baseAnchors[0].ev).toBe(-3600);
      expect(selected?.lastUpdated).toBe("2026-09-07");
    },
  );

  it("adds source bundles missing from an existing mixed folder without adding legacy source tables", async () => {
    const input = correctionMachine();
    await writeMachine("target", input);
    await writeMachine("legacy", machine("legacy"));
    await writeMachine("mixedonly", machine("mixedonly"), "mixed");

    const selected = await getMachine("target", "mixed");
    const listed = await getMachines("mixed");
    expect(listed.map((item) => item.id).sort()).toEqual(["mixedonly", "target"]);
    expect(selected).toEqual(onlyLowSetting(validateMachine(input)));
    expect(listed.find((item) => item.id === "target")).toEqual(selected);
    expect(listed.find((item) => item.id === "mixedonly")).toEqual(await getMachine("mixedonly", "mixed"));
    expect(await getMachine("legacy", "mixed")).toBeUndefined();
  });

  it("checks only the requested source and mixed files when selecting a newer bundle", async () => {
    const input = correctionMachine();
    await writeMachine("target", input);
    await writeMachine("target", correctionMachine("target", "2026-09-06", -3600), "mixed");
    for (const subdir of ["", "mixed"]) {
      await fs.writeFile(path.join(root, "data", "machines", subdir, "broken.json"), "invalid JSON");
    }
    const read = vi.spyOn(fs, "readFile");
    const list = vi.spyOn(fs, "readdir");

    expect(await getMachine("target", "mixed")).toEqual(onlyLowSetting(validateMachine(input)));
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls.map(([file]) => path.relative(root, String(file))).sort()).toEqual([
      path.join("data", "machines", "mixed", "target.json"),
      path.join("data", "machines", "target.json"),
    ].sort());
    expect(list).not.toHaveBeenCalled();
  });

  describe("corrected and uncorrected mixed halls are separate (2026-10-05)", () => {
    const sources = { schemaVersion: 1, halls: ["shinjuku", "kabuki"], inputSha256: "a".repeat(64) };

    it("shows a combined dataset with a correction as corrected in mixed and as measured in mixed-raw", async () => {
      const combined = { ...correctionMachine("target", "2026-09-07", -3600), mixedSources: sources };
      await writeMachine("target", combined, "mixed");

      const corrected = await getMachine("target", "mixed");
      expect(corrected?.profiles).toEqual(combined.setting1Correction.profiles);
      expect(corrected?.profiles[0].baseAnchors[0].ev).toBe(-3600);

      const raw = await getMachine("target", "mixed-raw");
      expect(raw).toEqual(withoutLowSetting(validateMachine(combined)));
      expect(raw?.profiles).toEqual(combined.profiles.slice(0, 2));
      expect(raw).not.toHaveProperty("setting1Correction");
      expect(await getMachines("mixed-raw")).toEqual([raw]);
    });

    it("lists a combined dataset without a correction only in mixed-raw", async () => {
      // 実データの「補正なし」の合算と同じく、設定1想定の表を持たない。
      const base = machine("rawonly");
      const combined = { ...base, mixedSources: sources,
        profiles: base.profiles.filter((profile) => !profile.label.includes("設定1想定")) };
      expect(combined.profiles.length).toBeGreaterThan(0);
      await writeMachine("rawonly", combined, "mixed");

      expect(await getMachine("rawonly", "mixed")).toBeUndefined();
      expect((await getMachines("mixed")).map((item) => item.id)).not.toContain("rawonly");
      expect(await getMachine("rawonly", "mixed-raw")).toEqual(withoutLowSetting(validateMachine(combined)));
    });

    it("never shows a single store's table or a legacy corrected file as uncorrected", async () => {
      await writeMachine("target", correctionMachine());
      await writeMachine("legacy", onlyLowSetting(validateMachine(correctionMachine("legacy"))), "mixed");
      expect(await getMachine("target", "mixed-raw")).toBeUndefined();
      expect(await getMachine("legacy", "mixed-raw")).toBeUndefined();
      expect(await getMachines("mixed-raw")).toEqual([]);
    });
  });

  it("uses the actual mixed file unchanged when the folder exists", async () => {
    await writeMachine("target");
    const mixed = machine();
    mixed.meta.samples = "123";
    await writeMachine("target", mixed, "mixed");
    expect(await getMachine("target", "mixed")).toEqual(validateMachine(mixed));
  });

  it("does not fall back to the default hall if an existing mixed folder lacks this machine", async () => {
    await writeMachine("target");
    await writeMachine("other", machine("other"), "mixed");
    expect(await getMachine("target", "mixed")).toBeUndefined();
  });

  it("omits a machine without estimated profiles from a derived mixed hall", async () => {
    const input = machine();
    input.profiles = [input.profiles[0]];
    await writeMachine("target", input);
    expect(await getMachine("target", "mixed")).toBeUndefined();
  });

  it("keeps machines with no measured payout exclusively in the derived mixed hall", async () => {
    const input = { ...machine(), calcSpec: { items: [{ k: "獲得は実測ではない", v: "推定" }] } };
    await writeMachine("target", input);
    expect(await getMachine("target")).toBeUndefined();
    expect(await getMachine("target", "mixed")).toEqual(validateMachine(input));
  });
});
