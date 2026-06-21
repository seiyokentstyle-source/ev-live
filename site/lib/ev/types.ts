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
  /** Estimated sample size (当たり＋打ち切り台日数) used for this G. Optional: absent on older data. */
  n?: number;
  /** Average medals invested from this G until the AT hit (機械割と同じ基準). Optional: absent on older data. */
  inv?: number;
  /** Average games to finish one session from this G (通常時＋AT中). Used for 時給. Optional: absent on older data. */
  playG?: number;
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
  /** このプロファイルのセッション総獲得枚数（出たメダル総数）。古い/未生成データでは undefined。 */
  totalPayout?: number;
  /** 平均初当り確率＝平均初当りG（AT・RB間）。1/X 表記の X。古い/未生成データでは undefined。 */
  firstHitRate?: number;
  /** When true, this profile has no 実戦 data yet: the tab is shown but no numbers are rendered. */
  dataPending?: boolean;
};

export type SettingAimUnit = {
  /** 台番号. */
  unit: string;
  /** 直近期間の平均推定出率（%）. */
  avg: number;
  /** 出率を計算できた日数. */
  days: number;
  /** dates と同じ並びの日別出率（その日のデータが無ければ null）. */
  rates: Array<number | null>;
  /** dates と同じ並びの日別総回転数（通常時G）。その日のデータが無ければ 0。古いデータには無い. */
  games?: number[];
  /** 期間合計の推定差枚（即やめ想定）. */
  net: number;
};

/** 設定狙いモード：台番号別の推定出率（OUT÷IN）。データ未生成の機種では undefined。 */
export type SettingAim = {
  label: string;
  unit: string;
  note: string;
  /** 列＝日付（昇順）. */
  dates: string[];
  /** 行＝台番号（avg 降順）. */
  units: SettingAimUnit[];
};

/** AT獲得モード：当選G帯ごとの平均獲得（1AT＝初当たり〜引き戻し終了）。 */
export type AtPayoutBand = {
  /** 帯の下限G（含む）. */
  lo: number;
  /** 帯の上限G（含まない）. */
  hi: number;
  /** その帯のAT回数（サンプル数）. */
  count: number;
  /** その帯の平均獲得枚数. */
  mean: number;
  /** その帯の中央値獲得枚数. */
  median: number;
};

export type AtPayout = {
  /** 帯の幅（G）. */
  step: number;
  label: string;
  note: string;
  /** 当選G帯（昇順）. */
  bands: AtPayoutBand[];
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
  /** 設定狙いモードのデータ。スクレイパーが対応機種にのみ出力する（古い/未対応データでは undefined）。 */
  settingAim?: SettingAim;
  /** AT獲得モードのデータ。古い/未生成データでは undefined。 */
  atPayout?: AtPayout;
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
  /** Sample size of the anchor at this exact G, when one exists. Undefined for interpolated/old rows. */
  n?: number;
  /** True when g is past the last sampled anchor: no 実戦 data, render as "—". */
  noData?: boolean;
};
