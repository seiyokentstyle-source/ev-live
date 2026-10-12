import type { MachineSummary } from "./ev/types";
import { LOW_SETTING_HALL_SUBDIR, RAW_MIXED_HALL_SUBDIR } from "./ev/low-setting";
import { DEFAULT_HALL_ID, HALLS, isListedHall } from "./halls";
import { compareMachines } from "./machine-order";
import { machineSelectionKey, preferMachineSummary, sameMachineSelection, machineSearchAliases } from "./machine-identity";
import { collectionPending } from "./ev/collection-status";

const virtualHalls = new Set([LOW_SETTING_HALL_SUBDIR, RAW_MIXED_HALL_SUBDIR]);

type HallSummary = { hallId: string; summary: MachineSummary };

/** Select one stored observation per hall/group; never add aliases' samples together. */
export function selectMachineHallSummaries<T extends HallSummary>(entries: T[]): T[] {
  const selected = new Map<string, T>();
  for (const entry of entries) {
    const key = `${entry.hallId}:${machineSelectionKey(entry.summary)}`;
    const previous = selected.get(key);
    // Old indexes did not carry forcePending. If alias IDs disagree within a real
    // hall, retain the hold until the server's consolidated index arrives. Mixed
    // tables are independent publications and must not inherit another source's hold.
    if (previous && !virtualHalls.has(entry.hallId) && previous.summary.id !== entry.summary.id
      && collectionPending(previous.summary.meta) !== collectionPending(entry.summary.meta)) {
      if (collectionPending(entry.summary.meta)) selected.set(key, entry);
      continue;
    }
    if (!previous || preferMachineSummary(entry.summary, previous.summary)) selected.set(key, entry);
  }
  return [...selected.values()];
}

export function findMachineHallSummary<T extends HallSummary>(entries: T[], machine: MachineSummary, hallId: string): T | undefined {
  return selectMachineHallSummaries(entries.filter(entry => entry.hallId === hallId
    && sameMachineSelection(entry.summary, machine)))[0];
}

function sourceSampleCount(samples: string): number | undefined {
  const text = samples.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return undefined;
  const count = Number(text.replace(/,/g, ""));
  return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
}

/** One visible card per machine; raw mixed samples also retain mixed-only halls' contribution. */
export function selectMachineListSummaries(entries: Array<{ hallId: string; summary: MachineSummary }>): MachineSummary[] {
  const priority = (id: string) => id === DEFAULT_HALL_ID ? -1 : HALLS.findIndex(hall => hall.id === id);
  const selected = new Map<string, MachineSummary>();
  const countedHalls = new Map<string, Set<string>>();
  const mixedSamples = new Map<string, number>();
  const ready = selectMachineHallSummaries(entries.filter(entry => HALLS.some(hall => hall.id === entry.hallId && hall.ready && isListedHall(hall))));
  for (const entry of ready.sort((a, b) => priority(a.hallId) - priority(b.hallId))) {
    if (!entry.summary.available) continue;
    const id = machineSelectionKey(entry.summary);
    if (!selected.has(id)) {
      selected.set(id, { ...entry.summary, aliases: machineSearchAliases(entry.summary), summaryHallId: entry.hallId, totalSamples: 0 });
      countedHalls.set(id, new Set());
    } else if (preferMachineSummary(entry.summary, selected.get(id)!)) {
      selected.set(id, { ...entry.summary, aliases: machineSearchAliases(entry.summary), summaryHallId: entry.hallId,
        totalSamples: selected.get(id)!.totalSamples });
    }
    const hall = HALLS.find(hall => hall.id === entry.hallId)!;
    const sampleCount = sourceSampleCount(entry.summary.meta.samples);
    if (hall.id === RAW_MIXED_HALL_SUBDIR && sampleCount !== undefined) mixedSamples.set(id, sampleCount);
    const counted = countedHalls.get(id)!;
    if (virtualHalls.has(hall.id) || virtualHalls.has(hall.dataSubdir) || counted.has(hall.id)) continue;
    counted.add(hall.id);
    selected.get(id)!.totalSamples! += sampleCount ?? 0;
  }
  for (const [id, totalSamples] of mixedSamples) selected.get(id)!.totalSamples = totalSamples;
  return [...selected.values()].sort(compareMachines);
}
