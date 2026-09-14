import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { onlyLowSetting, withoutLowSetting } from "../lib/ev/low-setting";
import { validateMachine } from "../lib/ev/validate";
import { normalizeSearchText } from "../lib/search/normalize";

let root: string;
let getMachine: typeof import("../lib/machines").getMachine;
let getMachines: typeof import("../lib/machines").getMachines;
let getMachineIds: typeof import("../lib/machines").getMachineIds;
let getMachineHallSummaries: typeof import("../lib/machines").getMachineHallSummaries;

function machine(id = "target") {
  const data = structuredClone(fixture);
  data.id = id;
  data.aliases = ["nickname"];
  data.profiles = [
    { ...data.profiles[0], key: "measured", label: "実測" },
    { ...data.profiles[0], key: "estimated", label: "設定1想定" }
  ];
  return data;
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
  ({ getMachine, getMachines, getMachineIds, getMachineHallSummaries } = await import("../lib/machines"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
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
