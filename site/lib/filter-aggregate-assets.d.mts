import type { Machine } from './ev/types';
export function externalizeMachineAggregations(machine: Machine,
  onAsset?: (sha256: string, body: string, layout: { axisCount: number; totalPlayGames: boolean }) => void): Machine;
