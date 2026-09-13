// 集計対象ホール（地域）の定義。
//
// 機種を選んだあと「どの店舗のデータで見るか」を選ばせるための一覧。
// data/machines/*.json はスクレイパーが上書きする資産で店舗の次元を持たないため、
// 店舗はサイト側のこの表だけで持つ（データ側は触らない）。
//
// ★現状 ready=true は新宿だけ。data/machines/*.json は全て
//   マルハン新宿東宝ビル店（scraper の address_text）で集めたもの。
//   他店の収集を始めたら、その店の JSON の置き場を dataDir に足して ready を立てる。
export type Hall = {
  /** URL に出る識別子（/machines/<機種id>/<ここ>）. */
  id: string;
  /** 地域の見出し。「新宿」「秋葉原」など。混合データは区分名を入れる. */
  area: string;
  /** 店舗の呼び名。ユーザーが選ぶときに見るのはこちら. */
  name: string;
  /** 一覧に出す補足（何のデータか）. */
  note: string;
  /** 集計済みデータがあるか。false は選べるが中身は「準備中」. */
  ready: boolean;
  /** data/machines 配下のどこを読むか。'' は直下（既存＝新宿）.
   *  スクレイパー側 halls.py の「データ小分け」と必ず同じ値にすること. */
  dataSubdir: string;
};

export const HALLS: Hall[] = [
  {
    id: "shinjuku",
    area: "新宿",
    name: "ゴジラのお店",
    note: "現在集計中。既存の実戦データは全てこの店舗のもの",
    ready: true,
    dataSubdir: ""
  },
  {
    id: "akihabara",
    area: "秋葉原",
    name: "萌えスロのお店",
    note: "集計対象に追加予定",
    ready: false,
    dataSubdir: "akihabara"
  },
  {
    id: "mixed",
    area: "混合",
    name: "低設定想定店舗混合",
    // ★ここだけ性格が違う。実測ではなく「実測を設定1相当に補正した推定」を置く場所。
    //   店舗別の表に推定が混ざると、どれが実戦値か見て分からないので分けている。
    note: "実測を設定1相当に補正した推定値（実戦値ではない）",
    // data/machines/mixed/ がまだ無くても、lib/ev/low-setting.ts が既定店舗の
    // JSONから設定1想定の表を拾って組み立てる＝再生成を待たずに中身がある。
    ready: true,
    dataSubdir: "mixed"
  }
];

/** 既定の店舗。店舗を指定しない導線から来たときはここへ送る. */
export const DEFAULT_HALL_ID = "shinjuku";

export function getHall(id: string): Hall | undefined {
  return HALLS.find((hall) => hall.id === id);
}

/** データが揃っている店舗だけ. */
export function getReadyHalls(): Hall[] {
  return HALLS.filter((hall) => hall.ready);
}
