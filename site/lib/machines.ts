import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import type { Machine } from "./ev/types";
import { validateMachine } from "./ev/validate";
import { LOW_SETTING_HALL_SUBDIR, onlyLowSetting, withoutLowSetting } from "./ev/low-setting";
import { compareMachines } from "./machine-order";

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
      ? await readMachines(dir)
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
  const machines = await getMachines(dataSubdir);
  return machines.find((machine) => machine.id === id);
}
