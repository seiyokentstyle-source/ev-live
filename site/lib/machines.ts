import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import type { Machine, MachineSummary } from "./ev/types";
import { validateMachine } from "./ev/validate";
import { LOW_SETTING_HALL_SUBDIR, onlyLowSetting, withoutLowSetting } from "./ev/low-setting";
import { compareMachines } from "./machine-order";
import { getReadyHalls } from "./halls";
import { machineSummary } from "./ev/summary";

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
      return validateMachine(JSON.parse(raw));
    })
  );
}

export async function getMachines(dataSubdir?: string): Promise<Machine[]> {
  const dir = hallDir(dataSubdir);
  // ★「設定1想定」をどの店舗に出すかはサイト側で決める（lib/ev/low-setting.ts）。
  //   生成側にも同じ切り分けを入れたが、そちらは再生成しないと効かない。
  //   ここで同じ結果になるようにしておけば、データを待たずに今のJSONで正しく出る。
  if (dataSubdir === LOW_SETTING_HALL_SUBDIR) {
    // 生成側が分けた本物のフォルダがあればそれを使う。無い間は既定店舗から導く。
    const machines = existsSync(dir)
      ? (await readMachines(dir)).map((machine) => machine.setting1Correction ? onlyLowSetting(machine)! : machine)
      : (await readMachines(hallDir()))
          .map(onlyLowSetting)
          .filter((machine): machine is Machine => machine !== null);
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

export async function getMachine(id: string, dataSubdir?: string): Promise<Machine | undefined> {
  // IDs are JSON basenames, not aliases or paths. Detail pages must not read
  // every machine again: each static route otherwise reparses the whole data set.
  if (!/^[a-z0-9_-]+$/.test(id) || (dataSubdir && !/^[a-z0-9_-]+$/.test(dataSubdir))) {
    return undefined;
  }
  const dir = hallDir(dataSubdir);
  const isLowSetting = dataSubdir === LOW_SETTING_HALL_SUBDIR;
  // Match getMachines: derive mixed data only when the entire folder is absent,
  // never when one machine is missing from an existing mixed folder.
  const deriveLowSetting = isLowSetting && !existsSync(dir);
  const file = path.join(deriveLowSetting ? hallDir() : dir, `${id}.json`);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const machine = validateMachine(JSON.parse(raw));
  if (machine.id !== id) return undefined;
  return (deriveLowSetting || (isLowSetting && machine.setting1Correction)
    ? onlyLowSetting(machine) : isLowSetting ? machine : withoutLowSetting(machine)) ?? undefined;
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
