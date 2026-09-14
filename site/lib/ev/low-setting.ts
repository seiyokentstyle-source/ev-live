import type { Machine, Profile } from "./types";

/**
 * 「設定1想定」の表をどの店舗に出すかを決める。
 *
 * ★ここはサイト側の持ち物。データ側（スクレイパー）に置くと、見せ方を変えるたびに
 *   夜間の再生成を待つことになる。数値は1つも作らず、生成済みの profile を
 *   選び分けるだけなので、サイトで決めてよい。
 *   （数値はデータが正・並べ方はサイトが正）
 *
 * 設定1想定はその店の実測ではなく推定:
 *   - label に「設定1想定」を含む profile … 実測の当たり方に獲得補正だけ掛けた表
 *   - machine.theoretical                 … 公表スペックだけで作った表
 * 店舗別の表に混ざると、どれが実戦値か見て分からない。so 低設定想定店舗混合へ寄せる。
 */
export const LOW_SETTING_HALL_SUBDIR = "mixed";

const LOW_SETTING_MARK = "設定1想定";

/**
 * 獲得がデータカウンターに出ない機種の印（生成側 make_evlive_data.py が算出条件に立てる）。
 * 初当りG分布は実測だが、1回あたりの獲得は公表の設定1機械割からの逆算。
 * 期待値は獲得側で決まるので、表そのものが理論値になる＝実測の棚に並べない。
 */
const NO_MEASURED_PAYOUT_MARK = "獲得は実測ではない";

/** その機種の期待値が丸ごと理論値か（獲得が実測でない）。 */
function hasNoMeasuredPayout(machine: Machine): boolean {
  return (machine.calcSpec?.items ?? []).some((item) => item.k.includes(NO_MEASURED_PAYOUT_MARK));
}

function isLowSetting(profile: Profile): boolean {
  return profile.label.includes(LOW_SETTING_MARK);
}

/** 算出条件のうち「設定1想定の補正」の説明。表を出す側だけが持つ。 */
function splitCalcSpec(machine: Machine): { stay?: Machine["calcSpec"]; moved?: Machine["calcSpec"] } {
  const items = machine.calcSpec?.items;
  if (!items) return {};
  const moved = items.filter((item) => item.k.includes(LOW_SETTING_MARK));
  if (moved.length === 0) return { stay: machine.calcSpec };
  return { stay: { items: items.filter((item) => !item.k.includes(LOW_SETTING_MARK)) }, moved: { items: moved } };
}

/** 数値は生成側の確定済み表を使い、ここでは再補正しない。 */
function correctedMachine(machine: Machine): Machine | null {
  const correction = machine.setting1Correction;
  if (!correction) return null;
  const next: Machine = {
    ...machine,
    profiles: correction.profiles,
    meta: {
      ...machine.meta,
      source: `${machine.meta.source}／新宿の履歴を設定1相当に補正した推定`,
    },
    calcSpec: {
      items: [
        { k: "参照データ", v: "新宿で収集した履歴を使用。狙い方・絞り込み条件・当たり方と母数を揃えて算出" },
        { k: "設定1への補正", v: correction.method === "assumed-payout"
          ? `公表設定1の機械割${(correction.targetRtp * 100).toFixed(1)}%から獲得を逆算済み。追加の獲得補正は行わない`
          : `機種全体の機械割を公表設定1の${(correction.targetRtp * 100).toFixed(1)}%に合わせる獲得倍率${(correction.payoutScale * 100).toFixed(2)}%を、全ての狙い方と絞り込みに適用` },
        { k: "補正の前提", v: "当選G分布と条件別の母数は新宿の実測のまま。獲得の仮定を変えて期待値・機械割・消化時間を再計算。各条件の機械割を一律に設定1の値へ揃える処理ではない" },
        ...(machine.calcSpec?.items ?? []).filter((item) => item.k !== "設定1想定の補正"),
      ],
    },
  };
  delete next.setting1Correction;
  delete next.theoretical;
  delete next.settingAim;
  delete next.atPayout;
  delete next.harakiri;
  delete next.savedTargets;
  return next;
}

/** 店舗別の表示。推定の表を外す。 */
export function withoutLowSetting(machine: Machine): Machine | null {
  // 獲得が実測でない機種は表全体が理論値。実測の棚には置かない。
  if (hasNoMeasuredPayout(machine)) return null;
  const stay = machine.profiles.filter((profile) => !isLowSetting(profile));
  const hasEstimate = stay.length !== machine.profiles.length || Boolean(machine.theoretical) || Boolean(machine.setting1Correction);
  if (!hasEstimate) return machine;
  // 全部が推定なら profile は外さない。空の profiles は描画できず、
  // 機種ページが丸ごと消える。消すくらいならそのまま見せる。
  const next = { ...machine, profiles: stay.length > 0 ? stay : machine.profiles };
  delete next.setting1Correction;
  delete next.theoretical;
  // 出していない表の補正の説明が算出条件に残ると、何の話か分からない。
  const { stay: calcSpec } = splitCalcSpec(machine);
  if (calcSpec) next.calcSpec = calcSpec;
  return next;
}

/** 低設定想定店舗混合の表示。推定の表だけにする。無ければ null（一覧に出さない）。 */
export function onlyLowSetting(machine: Machine): Machine | null {
  const corrected = correctedMachine(machine);
  if (corrected) return corrected;
  // 獲得が実測でない機種は表が丸ごと理論値なので、そのまま全部こちらへ。
  if (hasNoMeasuredPayout(machine)) return machine;
  const moved = machine.profiles.filter(isLowSetting);
  if (moved.length === 0 && !machine.theoretical) return null;
  // profiles が空だと validate と同じ理由で描画できない。理論表しか無い機種は諦める。
  if (moved.length === 0) return null;
  const next: Machine = { ...machine, profiles: moved };
  // 補正の説明はこちらが持つ。表を出す側に無いと、何をどう補正したのか読めない。
  const { moved: calcSpec } = splitCalcSpec(machine);
  if (calcSpec) next.calcSpec = calcSpec;
  // 実測でしか出せないものは持って行かない（この店舗は推定だけを置く場所）。
  delete next.settingAim;
  delete next.atPayout;
  delete next.harakiri;
  delete next.savedTargets;
  return next;
}
