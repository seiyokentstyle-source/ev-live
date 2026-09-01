import type { Machine } from "./ev/types";

/** meta.samples は表示用に桁区切りの入った文字列（"4,807"）で来る。
 *  並べ替えに使うので数値へ戻す。読めない値は 0 として最後尾に送る。 */
export function sampleCount(machine: Machine): number {
  const n = Number(String(machine.meta.samples).replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 機種一覧の既定の並び順＝サンプルの多い順。
 *
 *  以前は導入日の新しい順だったが、導入日が未登録の機種は既定値
 *  （2024-01-01）のまま出力されるため、26機種が同着になって順不同に見えていた。
 *  さらに `make_evlive_data.py` の 機種情報 が部分一致のため、
 *  「ソードアート」1本のキーに SAO と SAO II のメタが混ざる事故も起きる。
 *  サンプル数は実測なので、そういう取り違えの影響を受けない。
 *
 *  同数のときは導入日の新しい順、それも同じなら id で固定して
 *  ビルドごとに並びが揺れないようにする。 */
export function compareMachines(a: Machine, b: Machine): number {
  const bySamples = sampleCount(b) - sampleCount(a);
  if (bySamples !== 0) return bySamples;
  const byDate = b.releaseDate.localeCompare(a.releaseDate);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}
