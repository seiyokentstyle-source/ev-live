import type { FilterAxis, FilterAxisMatchMode } from './types';
export function validateAggregateMatchModes(value: unknown, axes: FilterAxis[]): FilterAxisMatchMode[];
export function validateAggregateRows(value: unknown, axes: FilterAxis[], expectedRows?: number,
  axisMatchModes?: FilterAxisMatchMode[]): number[][];
