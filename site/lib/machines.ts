import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import type { Machine } from "./ev/types";
import { validateMachine } from "./ev/validate";
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

export async function getMachines(dataSubdir?: string): Promise<Machine[]> {
  const dir = hallDir(dataSubdir);
  // 未集計の店舗はフォルダ自体が無い。空一覧を返して「準備中」として扱う。
  if (!existsSync(dir)) return [];
  const entries = await fs.readdir(dir);
  const jsonFiles = entries.filter((entry) => entry.endsWith(".json"));
  const machines = await Promise.all(
    jsonFiles.map(async (fileName) => {
      const raw = await fs.readFile(path.join(dir, fileName), "utf8");
      return validateMachine(JSON.parse(raw));
    })
  );

  return machines.sort(compareMachines);
}

export async function getAvailableMachines(dataSubdir?: string): Promise<Machine[]> {
  const machines = await getMachines(dataSubdir);
  return machines.filter((machine) => machine.available);
}

export async function getMachine(id: string, dataSubdir?: string): Promise<Machine | undefined> {
  const machines = await getMachines(dataSubdir);
  return machines.find((machine) => machine.id === id);
}
