import type { Machine } from './ev/types';
export function externalizeMachineAggregations(machine: Machine,
  onAsset?: (sha256: string, body: string) => void): Machine;
