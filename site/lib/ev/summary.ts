import type { MachineSummary } from "./types";

/** List and hall-selection pages need counts and labels, not the complete EV tables. */
export function machineSummary(machine: MachineSummary): MachineSummary {
  const { id, name, manufacturer, aliases, available, thumb, releaseDate, lastUpdated, meta } = machine;
  return { id, name, manufacturer, aliases, available, thumb, releaseDate, lastUpdated, meta };
}
