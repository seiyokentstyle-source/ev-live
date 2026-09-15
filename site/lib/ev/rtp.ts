/** 現金収支を、等価の1枚20円を基準とする機械割へ換算する。 */
export const RTP_MEDAL_VALUE = 20;

export function cashRtp(ev: number, playG: number, bet = 3): number {
  const wager = RTP_MEDAL_VALUE * bet * playG;
  if (!Number.isFinite(ev) || !Number.isFinite(wager) || wager <= 0) return 100;
  return 100 + (ev / wager) * 100;
}

/** 小数1桁で損失が100.0%に丸まらないよう、従来の符号条件を保つ。 */
export function roundedRtp(rtp: number, ev = rtp - 100): number {
  const rounded = Math.round(rtp * 10) / 10;
  return ev >= 0 ? Math.max(rounded, 100) : Math.min(rounded, 99.9);
}

export function rtpExplanation(gamesPerHour: number, bet = 3): string {
  const hourlyPerPoint = RTP_MEDAL_VALUE * bet * gamesPerHour / 100;
  return `46/52は交換差を引いた収支の換算機械割。${gamesPerHour}G/時・${bet}枚掛けなら1ポイント＝時給${hourlyPerPoint.toLocaleString("ja-JP")}円。100＋期待値円÷（20円×${bet}枚×消化G）×100＝100＋時給÷${hourlyPerPoint}。表示は小数1桁に丸める`;
}

/** 旧データの理論表に残る説明だけを、現在の表示計算へ合わせる。 */
export function rewriteRtpNote(note: string, gamesPerHour: number, bet = 3): string {
  return note.replace(
    /※等価タブの機械割は[^。]*。46\/52タブは[^。]*。/g,
    `※${rtpExplanation(gamesPerHour, bet)}。`
  );
}
