import type { MachineSummary } from "./ev/types";
import { LOW_SETTING_HALL_SUBDIR, RAW_MIXED_HALL_SUBDIR } from "./ev/low-setting";
import { DEFAULT_HALL_ID, HALLS } from "./halls";
import { compareMachines } from "./machine-order";

const virtualHalls = new Set([LOW_SETTING_HALL_SUBDIR, RAW_MIXED_HALL_SUBDIR]);

function sourceSampleCount(samples: string): number {
  const text = samples.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return 0;
  const count = Number(text.replace(/,/g, ""));
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

/** One card per machine, retaining source metadata and summing physical halls only. */
export function selectMachineListSummaries(entries: Array<{ hallId: string; summary: MachineSummary }>): MachineSummary[] {
  const priority = (id: string) => id === DEFAULT_HALL_ID ? -1 : HALLS.findIndex(hall => hall.id === id);
  const selected = new Map<string, MachineSummary>();
  const countedHalls = new Map<string, Set<string>>();
  const ready = entries.filter(entry => HALLS.some(hall => hall.id === entry.hallId && hall.ready));
  for (const entry of ready.sort((a, b) => priority(a.hallId) - priority(b.hallId))) {
    if (!entry.summary.available) continue;
    const id = entry.summary.id;
    if (!selected.has(id)) {
      selected.set(id, { ...entry.summary, summaryHallId: entry.hallId, totalSamples: 0 });
      countedHalls.set(id, new Set());
    }
    const hall = HALLS.find(hall => hall.id === entry.hallId)!;
    const counted = countedHalls.get(id)!;
    if (virtualHalls.has(hall.id) || virtualHalls.has(hall.dataSubdir) || counted.has(hall.id)) continue;
    counted.add(hall.id);
    selected.get(id)!.totalSamples! += sourceSampleCount(entry.summary.meta.samples);
  }
  return [...selected.values()].sort(compareMachines);
}
