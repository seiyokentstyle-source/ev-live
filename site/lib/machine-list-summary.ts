import type { MachineSummary } from "./ev/types";
import { DEFAULT_HALL_ID, HALLS } from "./halls";
import { compareMachines } from "./machine-order";

/** One card per machine; its count always belongs to the selected source hall. */
export function selectMachineListSummaries(entries: Array<{ hallId: string; summary: MachineSummary }>): MachineSummary[] {
  const priority = (id: string) => id === DEFAULT_HALL_ID ? -1 : HALLS.findIndex(hall => hall.id === id);
  const selected = new Map<string, MachineSummary>();
  const ready = entries.filter(entry => HALLS.some(hall => hall.id === entry.hallId && hall.ready));
  for (const entry of ready.sort((a, b) => priority(a.hallId) - priority(b.hallId))) {
    if (!entry.summary.available || selected.has(entry.summary.id)) continue;
    selected.set(entry.summary.id, { ...entry.summary, summaryHallId: entry.hallId });
  }
  return [...selected.values()].sort(compareMachines);
}
