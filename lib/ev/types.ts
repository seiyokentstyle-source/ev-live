export type AxisValue = string | number;

export type Conditions = Record<string, AxisValue>;

export type AxisOption = {
  value: string;
  label: string;
};

export type SelectAxis = {
  key: string;
  label: string;
  type: "select";
  pivotable: boolean;
  default: string;
  options: AxisOption[];
};

export type NumberAxis = {
  key: string;
  label: string;
  type: "number";
  pivotable: boolean;
  default: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
};

export type Axis = SelectAxis | NumberAxis;

export type BaseAnchor = {
  g: number;
  ev: number;
  rtp: number;
};

export type Zone = {
  g: number;
  label: string;
};

export type Profile = {
  key: string;
  label: string;
  ceiling: string;
  gRange: {
    start: number;
    end: number;
    step: number;
  };
  activeAxes: string[];
  baseAnchors: BaseAnchor[];
  zones: Zone[];
  /** When true, this profile has no 実戦 data yet: the tab is shown but no numbers are rendered. */
  dataPending?: boolean;
};

export type ModifierMap = Record<string, Record<string, number>>;

export type Economics = {
  medalsPerGame: number;
  gamesPerHour: number;
};

export type Machine = {
  id: string;
  name: string;
  manufacturer: string;
  aliases: string[];
  thumb: string | null;
  available: boolean;
  releaseDate: string;
  lastUpdated: string;
  meta: {
    samples: string;
    source: string;
  };
  profiles: Profile[];
  axes: Axis[];
  modifiers: ModifierMap;
  creditValue: Record<string, number>;
  economics: Economics;
};

export type PivotConfig = {
  axisKey: string;
  values: string[];
};

export type TableRow = {
  g: number;
  ev: number;
  rtp: number;
  hourly: number;
  medals: number;
  zoneLabel?: string;
  pivotValues?: Record<string, number>;
  /** True when g is past the last sampled anchor: no 実戦 data, render as "—". */
  noData?: boolean;
};
