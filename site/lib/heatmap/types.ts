export const HEATMAP_GROUP_KEYS = ["all", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export type HeatmapGroupKey = (typeof HEATMAP_GROUP_KEYS)[number];

/** Only aggregate values leave the generator; no individual daily records. */
export type HeatmapUnit = {
  unit: string;
  days: number;
  net: number;
};

export type HeatmapPendingUnit = {
  unit: string;
  /** Null only when ranges overlap and aggregate-only inputs cannot prove unique days. */
  days: number | null;
  firstDate: string;
  lastDate: string;
  reasons: string[];
  overlappingPeriods?: Array<{ days: number; firstDate: string; lastDate: string; reason: string }>;
};

export type HeatmapGroup = {
  key: HeatmapGroupKey;
  label: string;
  firstDate: string | null;
  lastDate: string | null;
  units: HeatmapUnit[];
  /** History exists, but this date group has no monetary aggregate for these seats. */
  pendingUnits?: HeatmapPendingUnit[];
};

export type HeatmapData = {
  schema: "evlive-floor-heatmap/v1";
  hallId: "shinjuku";
  metric: "net";
  estimated: true;
  dataFrom: string | null;
  dataTo: string | null;
  /** Latest observed date among historical setting-aim snapshots used for specific days. */
  snapshotFallbackTo?: string;
  groups: HeatmapGroup[];
};

export type FloorSeat = { unit: string; x: number; y: number; width: number; height: number };
export type FloorLayout = {
  width: number;
  height: number;
  sourceUrl: string;
  asOf: string;
  seats: readonly FloorSeat[];
};
