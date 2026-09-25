import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import type { Machine, MachineSummary } from "./ev/types";
import { validateMachine } from "./ev/validate";
import { LOW_SETTING_HALL_SUBDIR, onlyLowSetting, withoutLowSetting } from "./ev/low-setting";
import { compareMachines } from "./machine-order";
import { getReadyHalls } from "./halls";
import { machineSummary } from "./ev/summary";
import { normalizeMachineMetadata } from "./machine-metadata";
import type { HeatmapCoverageMachine } from "./heatmap/coverage";

// Data lives at the repository root (data/machines), while the site builds from
// site/. Resolve against the repo root so it works whether the cwd is site/
// (next build / vitest) or the repo root.
function resolveMachinesDir(): string {
  const candidates = [
    path.join(process.cwd(), "data", "machines"),
    path.join(process.cwd(), "..", "data", "machines")
  ];
  return candidates.find((dir) => existsSync(dir)) ?? candidates[candidates.length - 1];
}

const machinesDir = resolveMachinesDir();

// 店舗ごとのデータ置き場。既定店舗（新宿）は data/machines 直下、他店は
// data/machines/<dataSubdir>/。スクレイパー側 make_evlive_data.py の OUT_DIR と対。
function hallDir(dataSubdir?: string): string {
  return dataSubdir ? path.join(machinesDir, dataSubdir) : machinesDir;
}

async function readMachines(dir: string): Promise<Machine[]> {
  // 未集計の店舗はフォルダ自体が無い。空一覧を返して「準備中」として扱う。
  if (!existsSync(dir)) return [];
  const entries = await fs.readdir(dir);
  const jsonFiles = entries.filter((entry) => entry.endsWith(".json"));
  return Promise.all(
    jsonFiles.map(async (fileName) => {
      const raw = await fs.readFile(path.join(dir, fileName), "utf8");
      return normalizeMachineMetadata(validateMachine(JSON.parse(raw)));
    })
  );
}

async function readMachine(dir: string, id: string): Promise<Machine | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(dir, `${id}.json`), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const machine = normalizeMachineMetadata(validateMachine(JSON.parse(raw)));
  return machine.id === id ? machine : undefined;
}

/** A stored correction survives an older collector overwriting the source JSON. */
function selectMixedMachine(stored?: Machine, source?: Machine): Machine | undefined {
  // A combined dataset must not be replaced by a single store's correction.
  if (stored && "mixedSources" in stored) {
    return stored.setting1Correction ? onlyLowSetting(stored) ?? undefined : stored;
  }
  // Validated dates use YYYY-MM-DD, so string comparison preserves date order.
  if (source?.setting1Correction && (!stored || source.lastUpdated >= stored.lastUpdated)) {
    return onlyLowSetting(source) ?? undefined;
  }
  return stored?.setting1Correction ? onlyLowSetting(stored) ?? undefined : stored;
}

export async function getMachines(dataSubdir?: string): Promise<Machine[]> {
  const dir = hallDir(dataSubdir);
  // ★「設定1想定」をどの店舗に出すかはサイト側で決める（lib/ev/low-setting.ts）。
  //   生成側にも同じ切り分けを入れたが、そちらは再生成しないと効かない。
  //   ここで同じ結果になるようにしておけば、データを待たずに今のJSONで正しく出る。
  if (dataSubdir === LOW_SETTING_HALL_SUBDIR) {
    const sources = await readMachines(hallDir());
    // フォルダが無い間は従来の設定1想定表も既定店舗から導く。
    if (!existsSync(dir)) {
      return sources.map(onlyLowSetting)
        .filter((machine): machine is Machine => machine !== null)
        .sort(compareMachines);
    }
    const storedById = new Map((await readMachines(dir)).map((machine) => [machine.id, machine]));
    const sourceById = new Map(sources.filter((machine) => machine.setting1Correction)
      .map((machine) => [machine.id, machine]));
    const ids = new Set([...storedById.keys(), ...sourceById.keys()]);
    const machines = [...ids].map((id) => selectMixedMachine(storedById.get(id), sourceById.get(id)))
      .filter((machine): machine is Machine => machine !== undefined);
    return machines.sort(compareMachines);
  }
  const machines = await readMachines(dir);
  return machines
    .map(withoutLowSetting)
    .filter((machine): machine is Machine => machine !== null)
    .sort(compareMachines);
}

export async function getAvailableMachines(dataSubdir?: string): Promise<Machine[]> {
  const machines = await getMachines(dataSubdir);
  return machines.filter((machine) => machine.available);
}

/** Default-hall presence only, including held/unavailable machines. No monetary values escape this path. */
export async function getShinjukuHeatmapCoverageSources(): Promise<HeatmapCoverageMachine[]> {
  return (await readMachines(hallDir())).map(({ id, lastUpdated, heatmapCoverage }) => ({ id, lastUpdated, heatmapCoverage }));
}

export async function getMachine(id: string, dataSubdir?: string): Promise<Machine | undefined> {
  // IDs are JSON basenames, not aliases or paths. Detail pages must not read
  // every machine again: each static route otherwise reparses the whole data set.
  if (!/^[a-z0-9_-]+$/.test(id) || (dataSubdir && !/^[a-z0-9_-]+$/.test(dataSubdir))) {
    return undefined;
  }
  const dir = hallDir(dataSubdir);
  const isLowSetting = dataSubdir === LOW_SETTING_HALL_SUBDIR;
  if (isLowSetting) {
    const source = await readMachine(hallDir(), id);
    if (!existsSync(dir)) return source ? onlyLowSetting(source) ?? undefined : undefined;
    return selectMixedMachine(await readMachine(dir, id), source);
  }
  const machine = await readMachine(dir, id);
  return machine ? withoutLowSetting(machine) ?? undefined : undefined;
}

/** Route IDs include machines collected only in a non-default hall. */
export async function getMachineIds(): Promise<string[]> {
  const halls = await Promise.all(getReadyHalls().map((hall) => getMachines(hall.dataSubdir)));
  return [...new Set(halls.flatMap((machines) => machines.map((machine) => machine.id)))];
}

export type MachineHallSummary = { hallId: string; summary: MachineSummary };

/** Metadata for navigation; each summary keeps the hall its counts came from. */
export async function getMachineHallSummaries(id: string): Promise<MachineHallSummary[]> {
  const summaries = await Promise.all(getReadyHalls().map(async (hall) => {
    const machine = await getMachine(id, hall.dataSubdir);
    return machine ? { hallId: hall.id, summary: machineSummary(machine) } : undefined;
  }));
  return summaries.filter((item): item is MachineHallSummary => item !== undefined);
}
