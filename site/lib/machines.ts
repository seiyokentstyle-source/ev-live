import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import type { Machine } from "./ev/types";
import { validateMachine } from "./ev/validate";

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

export async function getMachines(): Promise<Machine[]> {
  const entries = await fs.readdir(machinesDir);
  const jsonFiles = entries.filter((entry) => entry.endsWith(".json"));
  const machines = await Promise.all(
    jsonFiles.map(async (fileName) => {
      const raw = await fs.readFile(path.join(machinesDir, fileName), "utf8");
      return validateMachine(JSON.parse(raw));
    })
  );

  return machines.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
}

export async function getAvailableMachines(): Promise<Machine[]> {
  const machines = await getMachines();
  return machines.filter((machine) => machine.available);
}

export async function getMachine(id: string): Promise<Machine | undefined> {
  const machines = await getMachines();
  return machines.find((machine) => machine.id === id);
}
