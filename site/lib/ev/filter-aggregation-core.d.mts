import type { DecodedFilterAggregation, EvFilterTable, FilterAxis } from './types';
export type AggregateFilterTable = Omit<EvFilterTable, 'units'> & { units?: undefined };
export function roundAggregateEV(value: number, epsilon?: number): number;
export function aggregateFilterTable(data: DecodedFilterAggregation, axes: FilterAxis[],
  selection: Record<string, string | null>, fallbackStart: number): AggregateFilterTable;
