"use client";

import { useEffect, useState } from "react";
import type { MachineSummary } from "./ev/types";
import type { LiveIndex, LiveMachine } from "./live-data";
import { startLiveMachineRefresh, startLiveRefresh } from "./live-refresh";

export function useLiveIndex(): LiveIndex | null {
  const [index, setIndex] = useState<LiveIndex | null>(null);
  useEffect(() => startLiveRefresh(next => setIndex(next)), []);
  return index;
}

export function useLiveMachines(initial: MachineSummary[], hallId: string): MachineSummary[] {
  const index = useLiveIndex();
  return index ? index.machines.filter(item => item.hallId === hallId).map(item => item.summary) : initial;
}

export function useLiveMachine(initial: LiveMachine, hallId: string): LiveMachine {
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
