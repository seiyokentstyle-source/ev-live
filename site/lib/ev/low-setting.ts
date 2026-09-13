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

/** 店舗別の表示。推定の表を外す。 */
export function withoutLowSetting(machine: Machine): Machine {
  const stay = machine.profiles.filter((profile) => !isLowSetting(profile));
  const hasEstimate = stay.length !== machine.profiles.length || Boolean(machine.theoretical);
  if (!hasEstimate) return machine;
  // 全部が推定なら profile は外さない。空の profiles は描画できず、
  // 機種ページが丸ごと消える。消すくらいならそのまま見せる。
  const next = { ...machine, profiles: stay.length > 0 ? stay : machine.profiles };
  delete next.theoretical;
  // 出していない表の補正の説明が算出条件に残ると、何の話か分からない。
  const { stay: calcSpec } = splitCalcSpec(machine);
  if (calcSpec) next.calcSpec = calcSpec;
  return next;
}

/** 低設定想定店舗混合の表示。推定の表だけにする。無ければ null（一覧に出さない）。 */
export function onlyLowSetting(machine: Machine): Machine | null {
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
