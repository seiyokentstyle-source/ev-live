import { createHash } from "node:crypto";
import type { Machine, MachineSummary } from "./ev/types";
import { validateMachine } from "./ev/validate";
import { machineSummary } from "./ev/summary";
import { getHall, getReadyHalls } from "./halls";
import { getAvailableMachines, getMachine } from "./machines";
import { getSavedTargetCatalog, getSavedTargetRefreshes } from "./saved-target-catalog";
import {
  selectSavedTargets,
  type DisplayTarget,
  type MachineSavedTarget,
  type SavedTargetCatalog
} from "./saved-targets.mjs";

export type LiveMachine = {
  schema: "evlive-live-machine/v1";
  revision: string;
  machine: Machine;
  savedTargets: DisplayTarget[];
};

export type LiveIndexEntry = {
  hallId: string;
  id: string;
  revision: string;
  summary: MachineSummary;
};

export type LiveIndex = {
  schema: "evlive-live-index/v1";
  machines: LiveIndexEntry[];
};

/** Use the same public data boundary as the rendered page, including catalog membership. */
export function buildLiveMachine(
  data: unknown,
  hallId: string,
  catalog: SavedTargetCatalog,
  refreshed: MachineSavedTarget[] = []
): LiveMachine {
  const machine = validateMachine(data);
  const savedTargets = selectSavedTargets(catalog, machine.id, hallId, refreshed);
  // Hash the complete public payload: same-day recalculation and target removal
  // must update an open table even when the headline sample count is unchanged.
  const revision = createHash("sha256").update(JSON.stringify({ machine, savedTargets })).digest("hex");
  return { schema: "evlive-live-machine/v1", revision, machine, savedTargets };
}

export function liveIndexEntry(hallId: string, payload: LiveMachine): LiveIndexEntry {
  return {
    hallId,
    id: payload.machine.id,
    revision: payload.revision,
    summary: machineSummary(payload.machine)
  };
}

/** Only published machines in ready halls get a static detail endpoint. */
export async function getLiveMachineParams(): Promise<Array<{ hall: string; id: string }>> {
  const halls = await Promise.all(getReadyHalls().map(async (hall) => {
    const machines = await getAvailableMachines(hall.dataSubdir);
    return machines.map((machine) => ({ hall: hall.id, id: `${machine.id}.json` }));
  }));
  return halls.flat();
}

export async function getLiveMachine(machineId: string, hallId: string): Promise<LiveMachine | undefined> {
  const hall = getHall(hallId);
  if (!hall?.ready || !/^[a-z0-9]{1,40}$/.test(machineId)) return undefined;
  const machine = await getMachine(machineId, hall.dataSubdir);
  if (!machine?.available) return undefined;
  const [catalog, refreshed] = await Promise.all([
    getSavedTargetCatalog(),
    getSavedTargetRefreshes(machineId, hall.dataSubdir)
  ]);
  return buildLiveMachine(machine, hall.id, catalog, refreshed);
}

export async function getLiveIndex(): Promise<LiveIndex> {
  const catalog = await getSavedTargetCatalog();
  const halls = await Promise.all(getReadyHalls().map(async (hall) => {
    const machines = await getAvailableMachines(hall.dataSubdir);
    return Promise.all(machines.map(async (machine) => {
      const refreshed = await getSavedTargetRefreshes(machine.id, hall.dataSubdir);
      return liveIndexEntry(hall.id, buildLiveMachine(machine, hall.id, catalog, refreshed));
    }));
  }));
  return { schema: "evlive-live-index/v1", machines: halls.flat() };
}
