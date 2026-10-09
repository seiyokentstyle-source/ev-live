import type { FilterAggregationParameters, NormalCostSchedule } from './types';
export function validateNormalCostSchedule(value: unknown, medalsPerGame: number,
  schema: FilterAggregationParameters['schema']): NormalCostSchedule | undefined;
export function normalInvestmentMedals(start: number, play: number, medalsPerGame: number,
  schedule?: NormalCostSchedule): number;
