import { createHash } from "node:crypto";
import { externalizeMachineAggregations } from "./filter-aggregate-assets.mjs";
import { splitCzThroughProfiles } from "./cz-through-profiles.mjs";
import type { CounterEstimate, Machine, MachineSummary, ProvisionalSetting1 } from "./ev/types";
import { validateMachineProvisionalSetting1 } from "./ev/provisional-setting1";
import { assertSingleAttachment, validateMachineCounterEstimate } from "./ev/counter-estimate";
import { validateMachine } from "./ev/validate";
import { validateMachineKatanaEstimate } from "./ev/katana-estimate";
import { machineSummary } from "./ev/summary";
import { getHall, getReadyHalls, isListedHall } from "./halls";
import { getHallDisplays, getHallDisplay } from "./machines";
import { validateCollectedMachine, type CollectedMachine } from "./collection-status-contract";
import { getSavedTargetCatalog, getSavedTargetSnapshot } from "./saved-target-catalog";
import { intervalHallForEvot } from "./interval-halls.mjs";
import {
  selectSavedTargets,
  savedTargetReplaySource,
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

export type LiveCollection = {
  schema: "evlive-live-collection/v1";
  revision: string;
  machine: MachineSummary;
  pending: Omit<CollectedMachine, "summary">;
  provisionalSetting1?: ProvisionalSetting1;
  counterEstimate?: CounterEstimate;
};
export type LiveSnapshot = LiveMachine | LiveCollection;

export function buildLiveCollection(value: CollectedMachine, reference?: ProvisionalSetting1, estimate?: CounterEstimate, hallId?: string): LiveCollection {
  const { summary: machine, ...pending } = validateCollectedMachine(value);
  const attachment = {
    ...(reference === undefined ? {} : { provisionalSetting1: validateMachineProvisionalSetting1(reference, machine.id, machine.name) }),
    ...(estimate === undefined ? {} : { counterEstimate: validateMachineCounterEstimate(estimate, machine.id, hallId) }),
  };
  assertSingleAttachment(attachment);
  const revision = createHash("sha256").update(JSON.stringify({ machine, pending, ...attachment })).digest("hex");
  return { schema: "evlive-live-collection/v1", revision, machine, pending, ...attachment };
}

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
  refreshed: MachineSavedTarget[] = [],
  replaySource: string | null | undefined = savedTargetReplaySource(data, hallId)
): LiveMachine {
  const machine = externalizeMachineAggregations(validateMachine(
    splitCzThroughProfiles(validateMachine(data))
  ));
  if (machine.counterEstimate !== undefined) validateMachineCounterEstimate(machine.counterEstimate, machine.id, hallId);
  if (machine.katanaEstimate !== undefined) validateMachineKatanaEstimate(machine.katanaEstimate, machine.id, machine.name, hallId);
  const savedTargets = selectSavedTargets(catalog, machine.id, hallId, refreshed, replaySource);
  // Hash the complete public payload: same-day recalculation and target removal
  // must update an open table even when the headline sample count is unchanged.
  const revision = createHash("sha256").update(JSON.stringify({ machine, savedTargets })).digest("hex");
  return { schema: "evlive-live-machine/v1", revision, machine, savedTargets };
}

export function liveIndexEntry(hallId: string, payload: LiveSnapshot, games?: number): LiveIndexEntry {
  const summary = machineSummary(payload.machine);
  return {
    hallId,
    id: payload.machine.id,
    revision: payload.revision,
    // 公開用に作り直した機種には、表示の都合で外した設定狙い表の総回転が付いていない。一覧と同じ値を渡す。
    summary: summary.games === undefined && games !== undefined ? { ...summary, games } : summary
  };
}

/** Only published machines in ready halls get a static detail endpoint. */
export async function getLiveMachineParams(): Promise<Array<{ hall: string; id: string }>> {
  // 全店舗を同時に展開しないよう、1店舗ずつ読む。
  const params: Array<{ hall: string; id: string }> = [];
  for (const hall of getReadyHalls()) {
    for (const display of await getHallDisplays(hall.id)) params.push({ hall: hall.id,
      id: `${display.kind === "machine" ? display.machine.id : display.collection.summary.id}.json` });
  }
  return params;
}

async function publishedTargetSnapshot(machineId: string, hallId: string, dataSubdir: string, catalog: SavedTargetCatalog) {
  const sourceHall = intervalHallForEvot(hallId);
  // Most machines have no published target. Do not reread their potentially
  // large source JSON just to return an empty target list (especially mixed).
  if (!sourceHall || !catalog.targets.some(target => target.machineId === machineId && target.hallId === sourceHall.id)) {
    return { refreshed: [], replaySource: null };
  }
  return getSavedTargetSnapshot(machineId, dataSubdir, hallId);
}

export async function getLiveMachine(machineId: string, hallId: string): Promise<LiveSnapshot | undefined> {
  const hall = getHall(hallId);
  if (!isListedHall(hall) || !hall.ready || !/^[a-z0-9]{1,40}$/.test(machineId)) return undefined;
  const display = await getHallDisplay(machineId, hallId);
  if (!display) return undefined;
  if (display.kind === "collection") return buildLiveCollection(display.collection, display.provisionalSetting1, display.counterEstimate, hallId);
  const machine = display.machine;
  const catalog = await getSavedTargetCatalog();
  const targets = await publishedTargetSnapshot(machine.id, hall.id, hall.dataSubdir, catalog);
  return buildLiveMachine(machine, hall.id, catalog, targets.refreshed, targets.replaySource);
}

export async function getLiveIndex(): Promise<LiveIndex> {
  const catalog = await getSavedTargetCatalog();
  // 全店舗を同時に展開しないよう、1店舗ずつ読んで索引の項目だけ残す。
  const machines = [];
  for (const hall of getReadyHalls()) {
    const displays = await getHallDisplays(hall.id);
    machines.push(...await Promise.all(displays.map(async (display) => {
      if (display.kind === "collection") return liveIndexEntry(hall.id, buildLiveCollection(display.collection, display.provisionalSetting1, display.counterEstimate, hall.id));
      const machine = display.machine;
      const targets = await publishedTargetSnapshot(machine.id, hall.id, hall.dataSubdir, catalog);
      return liveIndexEntry(hall.id, buildLiveMachine(machine, hall.id, catalog, targets.refreshed, targets.replaySource),
        machineSummary(machine).games);
    })));
  }
  return { schema: "evlive-live-index/v1", machines };
}
