// 集計元の店舗情報は全て保持し、画面・公開ルートは可視店舗だけを選ぶ。
// mixed-only の店舗もデータ上の区分と店舗混合への寄与を失わない。
import publishedHalls from "../../data/published-halls.json";

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
  /** 省略はlisted。mixed-onlyは個別表示せず、混合の集計元として保持する。 */
  visibility?: "listed" | "mixed-only";
};

const DEFAULT_HALLS: Hall[] = [
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
    id: "kabuki",
    area: "新宿",
    name: "歌舞伎のお店",
    note: "Daidataの保存済み履歴をゴジラのお店と共通の機種仕様・計算条件で集計。算出保留の機種は保留表示",
    ready: true,
    dataSubdir: "kabuki"
  },
  {
    id: "mixed",
    area: "混合",
    name: "低設定想定店舗混合（設定1補正）",
    // ★ここだけ性格が違う。実測ではなく「実測を設定1相当に補正した推定」を置く場所。
    //   店舗別の表に推定が混ざると、どれが実戦値か見て分からないので分けている。
    //   補正の無い機種はここに出さない（補正なしは下の mixed-raw。利用者指定 2026-10-05）。
    note: "収集済み店舗の合算を、公表の設定1機械割に合わせて補正した推定。補正のない機種は出さない",
    // data/machines/mixed/ がまだ無くても、lib/ev/low-setting.ts が既定店舗の
    // JSONから設定1想定の表を拾って組み立てる＝再生成を待たずに中身がある。
    ready: true,
    dataSubdir: "mixed"
  },
  {
    id: "mixed-raw",
    area: "混合",
    name: "店舗混合（補正なし）",
    // 同じ data/machines/mixed/ の表を、設定1補正をかけずに実測の合算のまま出す。
    note: "収集済み店舗の履歴を台番号が混ざらない形で合算した実測のまま。設定1補正はかけない",
    ready: true,
    dataSubdir: "mixed-raw"
  }
];

// The publisher exports registered backend halls here after selecting a store.
// New stores therefore use the existing routes without a second manual list.
const registeredHalls: Hall[] = publishedHalls.map(hall => {
  if (hall.visibility !== undefined && hall.visibility !== "listed" && hall.visibility !== "mixed-only") {
    throw new Error(`Invalid hall visibility: ${hall.id}`);
  }
  return { ...hall, visibility: hall.visibility as Hall["visibility"] };
});
const publishedById = new Map<string, Hall>(registeredHalls.map((hall) => [hall.id, hall]));
export const HALLS: Hall[] = [
  ...DEFAULT_HALLS.map((hall) => publishedById.get(hall.id) ?? hall),
  ...registeredHalls.filter((hall) => !DEFAULT_HALLS.some((item) => item.id === hall.id)),
];

/** 既定の店舗。店舗を指定しない導線から来たときはここへ送る. */
export const DEFAULT_HALL_ID = "shinjuku";

export function getHall(id: string): Hall | undefined {
  return HALLS.find((hall) => hall.id === id);
}

export function isListedHall(hall: Hall | undefined): hall is Hall {
  return hall !== undefined && (hall.visibility === undefined || hall.visibility === "listed");
}

/** 混合を先頭に、地域内の登録順を保った表示店舗。未登録店舗は作らない。 */
export function getVisibleHalls(halls: readonly Hall[] = HALLS): Hall[] {
  const priority = (hall: Hall) => hall.id === "mixed" ? 0 : hall.id === "mixed-raw" ? 1
    : ({ 新宿: 2, 池袋: 3, 秋葉原: 4 } as Record<string, number>)[hall.area] ?? 5;
  return halls.filter(isListedHall).sort((a, b) => priority(a) - priority(b));
}

/** 個別表示でき、データが揃っている店舗だけ. */
export function getReadyHalls(): Hall[] {
  return getVisibleHalls().filter((hall) => hall.ready);
}
