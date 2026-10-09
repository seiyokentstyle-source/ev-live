"use client";

import { useEffect, useState } from "react";
import type { MachineSummary } from "./ev/types";
import type { LiveIndex, LiveSnapshot } from "./live-data";
import { startLiveMachineRefresh, startLiveRefresh } from "./live-refresh";
import { selectMachineListSummaries } from "./machine-list-summary";
import { getHall, isListedHall } from "./halls";

export function useLiveIndex(): LiveIndex | null {
  const [index, setIndex] = useState<LiveIndex | null>(null);
  useEffect(() => startLiveRefresh(next => setIndex(next)), []);
  return index;
}

export function useLiveMachines(initial: MachineSummary[], hallId?: string): MachineSummary[] {
  const index = useLiveIndex();
  if (hallId && !isListedHall(getHall(hallId))) return [];
  if (!index) return initial;
  return hallId ? index.machines.filter(item => item.hallId === hallId).map(item => item.summary)
    : selectMachineListSummaries(index.machines);
}

export function useLiveMachine(initial: LiveSnapshot, hallId: string): LiveSnapshot {
  const [current, setCurrent] = useState({ hallId, data: initial });
  useEffect(() => {
    setCurrent({ hallId, data: initial });
    return startLiveMachineRefresh(initial, hallId, next => {
      // All counts, anchors, conditions and published targets move to one snapshot together.
      setCurrent({ hallId, data: next });
    });
  }, [initial, hallId]);
  return current.hallId === hallId && current.data.machine.id === initial.machine.id ? current.data : initial;
}
