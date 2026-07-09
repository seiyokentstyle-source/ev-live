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

/** 絞り込み再集計の共通パラメータ（機種スペック由来）。 */
export type EvCalc = {
  /** 通常時使用枚数（枚/G）. */
  use: number;
  /** AT純増ペース（枚/G）. 0 のとき AT中G を 0 とみなす. */
  junzou: number;
  /** 天井G（アンカー上限）. */
  ceiling: number;
  /** アンカー間隔G. */
  step: number;
};

/** プロファイルの生サンプル（絞り込み時にアンカーを再集計するため）。 */
export type EvSamples = {
  /** 貸単価（円/枚）. */
  tai: number;
  /** 換金単価（円/枚）. */
  kan: number;
  /** アンカー打ち切り件数. */
  minSess: number;
  /** 当たり: [台番号, 取得日, 初当りG, 総獲得, 道中CZ数?]. 道中CZ数はAT間区切り機種(ヴヴヴ2)のみ5要素目に入る. */
  hits: Array<[string, string, number, number, number?]>;
  /** 打ち切り: [台番号, 取得日, ハマりG]. */
  cens: Array<[string, string, number]>;
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
  /** 生サンプル（台番号末尾/特定日の絞り込みで再集計に使う）。古い/未生成データでは undefined。 */
  ev?: EvSamples;
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

/** ハラキリドライブ（台番号別・推定）の1台分。 */
export type HarakiriUnit = {
  /** 台番号. */
  unit: string;
  /** セッション（AT・RB間の初当り）数. */
  sessions: number;
  /** ラッシュ突入（連チャンが1回以上続いたセッション）数. */
  rush: number;
  /** ハラキリ発生（ラッシュ中の1回で獲得しきい値以上）の推定回数. */
  hits: number;
  /** 発生率％＝hits÷rush×100（rush=0なら0）. */
  rate: number;
};

/** ハラキリドライブモード：台番号別の推定発生率。対応機種（ヴヴヴ2）のみ。 */
export type Harakiri = {
  label: string;
  note: string;
  /** 判定しきい値（ラッシュ中1回の獲得枚数）. */
  threshold: number;
  /** 全台合計（機種全体の率。台別より信頼できる）. */
  total: { sessions: number; rush: number; hits: number; rate: number };
  /** 行＝台番号（rate降順）. */
  units: HarakiriUnit[];
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
  /** ハラキリドライブモードのデータ。対応機種（ヴヴヴ2）のみ。古い/未生成データでは undefined。 */
  harakiri?: Harakiri;
  /** 絞り込み再集計の共通パラメータ。古い/未生成データでは undefined。 */
  evCalc?: EvCalc;
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
