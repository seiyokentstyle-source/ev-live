import { promises as fs } from "node:fs";
import path from "node:path";
import { validateCollectionCatalog, type CollectionStatusEntry } from "./collection-status-contract";

export async function readCollectionCatalog(dataRoot: string, hallId: string): Promise<CollectionStatusEntry[]> {
  if (!/^[a-z0-9_-]+$/.test(hallId) || hallId === "mixed") return [];
  let raw: string;
  try { raw = await fs.readFile(path.join(dataRoot, "halls", hallId, "collection-status.json"), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return validateCollectionCatalog(JSON.parse(raw), hallId);
}
