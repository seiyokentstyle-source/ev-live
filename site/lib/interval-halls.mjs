// Explorer identity is the collector's source hall, not an EVOT display variant.
// Mixed intervals are uncorrected; they must never link to the corrected mixed table.
export const INTERVAL_HALLS = Object.freeze([
  Object.freeze({ id: 'shinjuku', dataSubdir: '', name: 'ゴジラのお店', evotHallId: 'shinjuku' }),
  Object.freeze({ id: 'kabuki', dataSubdir: 'kabuki', name: '歌舞伎のお店', evotHallId: 'kabuki' }),
  Object.freeze({ id: 'mixed', dataSubdir: 'mixed', name: '店舗混合（補正なし）', evotHallId: 'mixed-raw' }),
]);

export const intervalHall = id => INTERVAL_HALLS.find(hall => hall.id === id);
export const intervalHallForEvot = id => INTERVAL_HALLS.find(hall => hall.evotHallId === id);
