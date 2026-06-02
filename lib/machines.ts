import { promises as fs } from "node:fs";
import path from "node:path";
import type { Machine } from "./ev/types";
import { validateMachine } from "./ev/validate";

const machinesDir = path.join(process.cwd(), "data", "machines");

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
