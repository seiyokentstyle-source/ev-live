import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { onlyLowSetting, withoutLowSetting } from "../lib/ev/low-setting";
import { validateMachine } from "../lib/ev/validate";

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

async function writeMachine(id: string, data = machine(id), subdir = "") {
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
