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

/**
 * 同じ店舗混合データの、設定1補正をかけていない実測のままの表を出す店舗（利用者指定 2026-10-05）。
 * ★フォルダは持たない。data/machines/mixed/ を読み、補正の表を外して出す。
 *   補正あり（mixed）と補正なし（mixed-raw）が同じ入口に混ざると、どちらの数字か分からない。
 */
export const RAW_MIXED_HALL_SUBDIR = "mixed-raw";

const LOW_SETTING_MARK = "設定1想定";

/**
 * 獲得がデータカウンターに出ない機種の印（生成側 make_evlive_data.py が算出条件に立てる）。
 * 初当りG分布は実測だが、1回あたりの獲得は公表の設定1機械割からの逆算。
 * 想定獲得の表は原則として店舗別の実測表から外す。確認済みの単店モデルだけは
 * 当該店舗の当選G・母数を使う想定表として、前提を明示して表示する。
 */
const NO_MEASURED_PAYOUT_MARK = "獲得は実測ではない";

/** その機種の期待値が丸ごと理論値か（獲得が実測でない）。 */
function hasNoMeasuredPayout(machine: Machine): boolean {
  return (machine.calcSpec?.items ?? []).some((item) => item.k.includes(NO_MEASURED_PAYOUT_MARK));
}

// 生成側・サイト仕様で単店の主表として認められているモデルだけを選ぶ。
// 同名の別ID、後継機、他店や混合へこの例外を広げない。
const ASSUMED_PAYOUT_MODELS = [
  { id: "m407111cd", name: "L魔法少女にあこがれて", event: "AT当選G", halls: ["shinjuku", "akihabara"] },
  { id: "mfb4da289", name: "ソードアート・オンラインII", event: "CZ当選G", halls: ["shinjuku", "akihabara", "kabuki"] },
] as const;
const ASSUMED_PAYOUT_PROFILE_KEYS = new Set([
  "game_ceiling_4652", "game_ceiling_5050", "reset_4652", "reset_5050",
]);

/** 登録済みの単店モデルに限り、表の常時表示する前提説明を返す。 */
export function assumedPayoutNotice(machine: Machine, hallId?: string): string | undefined {
  const model = ASSUMED_PAYOUT_MODELS.find(item => item.id === machine.id && item.name === machine.name
    && item.halls.some(hall => hall === hallId));
  // A separately generated setting-1 correction is not the single-store main
  // table. Keep the existing classification and validate only profiles shown.
  const profiles = machine.profiles.filter(profile => !isLowSetting(profile));
  if (!model || !hasNoMeasuredPayout(machine) || machine.mixedSources || machine.officialCalibrationHold
    || machine.counterEstimate || machine.provisionalSetting1 || profiles.length === 0
    || profiles.some(profile => !ASSUMED_PAYOUT_PROFILE_KEYS.has(profile.key))
    || !profiles.some(profile => !profile.dataPending && profile.baseAnchors.length > 0)) return undefined;
  return `想定獲得の期待値表 · ${model.event}・母数はこの店舗の実測。獲得枚数は公表設定1機械割から逆算した仮定で、実測の獲得ではありません。`;
}

/** 獲得実測を必要とする別機能へ想定値を渡さず、生成済みの主表だけを使う。 */
function assumedPayoutMachine(machine: Machine): Machine {
  const next = { ...machine, profiles: machine.profiles.filter(profile => !isLowSetting(profile)).map(profile => ({ ...profile,
    label: profile.label.includes("（獲得想定）") ? profile.label
      : `${profile.label.replace(/実測/g, "当選G実測")}（獲得想定）`,
  })) };
  delete next.setting1Correction;
  delete next.theoretical;
  delete next.settingAim;
  delete next.atPayout;
  delete next.katanaEstimate;
  delete next.harakiri;
  delete next.savedTargets;
  const { stay: calcSpec } = splitCalcSpec(machine);
  if (calcSpec) next.calcSpec = calcSpec;
  return next;
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
  const calibrated = correction.method === "official-calibration";
  const sharedLedger = correction.method === "shared-ledger";
  const next: Machine = {
    ...machine,
    profiles: correction.profiles,
    meta: {
      ...machine.meta,
      source: `${machine.meta.source}／上記の収集対象店舗の履歴を設定1相当に補正した推定`,
    },
    calcSpec: {
      items: [
        { k: "参照データ", v: "収集元として記載された店舗の履歴を使用。狙い方・絞り込み条件・当たり方と母数を揃えて算出" },
        { k: "設定1への補正", v: sharedLedger
          ? `完結した全状態の区間を同じ投資・消化Gで計算し、全体の等価機械割${(correction.targetRtp * 100).toFixed(1)}%から共通のボーナス単価を逆算。条件別の参考機械割に合わせる倍率は使用しません`
          : calibrated
          ? "提供された条件別機械割と全体97.9%を基準に獲得を校正した推定。等価・前回連チャン不問で照合し、46/52は交換差を反映"
          : correction.method === "assumed-payout"
          ? `公表設定1の機械割${(correction.targetRtp * 100).toFixed(1)}%から獲得を逆算済み。追加の獲得補正は行わない`
          : `機種全体の機械割を公表設定1の${(correction.targetRtp * 100).toFixed(1)}%に合わせる獲得倍率${(correction.payoutScale * 100).toFixed(2)}%を、全ての狙い方と絞り込みに適用` },
        { k: "補正の前提", v: sharedLedger
          ? "表示する表は朝一・駆け抜け後・駆け抜け後以外に分け、駆け抜け後以外には通常AT後と上位AT後を含めます。全状態の平均は共通単価の補正と参考機械割の比較に使用し、前回連チャンで絞っても単価は変えません。獲得枚数と液晶Gは履歴からの推定です"
          : calibrated
          ? "履歴から推定した当選G・前回連チャン数・母数を維持。同じ区間の校正獲得をすべての打ち始めGと絞り込みに使用。連チャン別の値を個別に目標へ合わせ直すことはしません"
          : "当選G分布と条件別の母数は収集対象店舗の実測のまま。獲得の仮定を変えて期待値・機械割・消化時間を再計算。各条件の機械割を一律に設定1の値へ揃える処理ではない" },
        ...(calibrated ? (correction.calibration?.assumptions ?? []).map(v => ({ k: "参考値との照合条件", v })) : []),
        ...(sharedLedger ? [{ k: "参考機械割との比較", v: "前兆は指定の30Gを仮定し、ST中の減枚は通常時と同じベースで計算。上位後の引き戻しはカウンター信号から分類した区間を反映します。メーカーの計算条件との一致は未確認で、上位CZ失敗後の区間も外部履歴から確定できません" }] : []),
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

/** 店舗別の表示。登録済みの単店モデル以外の推定表を外す。 */
export function withoutLowSetting(machine: Machine, hallId?: string): Machine | null {
  if (hasNoMeasuredPayout(machine)) return assumedPayoutNotice(machine, hallId) ? assumedPayoutMachine(machine) : null;
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
  // この参考試算の回収は設定未調整。どの設定1表示経路にも運ばない。
  if (machine.katanaEstimate !== undefined) {
    const { katanaEstimate: _katanaEstimate, ...withoutKatana } = machine;
    machine = withoutKatana;
  }
  if (machine.officialCalibrationHold) return null;
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
