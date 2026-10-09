/** Bands start after the stated number of completed normal games. */
export function validateNormalCostSchedule(value, medalsPerGame, schema) {
  if (value === undefined) return undefined;
  const fail = () => { throw new Error('Invalid machine data: normalCostSchedule must be an ordered v2 cost schedule'); };
  if (schema !== 'evlive-filter-aggregates/v2' || !Number.isFinite(medalsPerGame) || medalsPerGame <= 0 ||
      !Array.isArray(value) || value.length === 0) fail();
  let previous = -1;
  for (const band of value) {
    if (!band || typeof band !== 'object' || Array.isArray(band) ||
        Object.keys(band).length !== 2 || !Object.hasOwn(band, 'fromGame') || !Object.hasOwn(band, 'medalsPerGame') ||
        !Number.isFinite(band.fromGame) || band.fromGame < 0 || band.fromGame <= previous ||
        !Number.isFinite(band.medalsPerGame) || band.medalsPerGame <= 0) fail();
    previous = band.fromGame;
  }
  if (value[0].fromGame !== 0 || Math.abs(value[0].medalsPerGame - medalsPerGame) >
      Math.max(1e-12, 1e-12 * Math.max(Math.abs(value[0].medalsPerGame), Math.abs(medalsPerGame)))) fail();
  return value;
}

/** F(start + play) - F(start), preserving physical games for time and RTP. */
export function normalInvestmentMedals(start, play, medalsPerGame, schedule) {
  if (schedule === undefined) return play * medalsPerGame;
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(play) || play < 0) {
    throw new Error('Invalid normal investment game count');
  }
  const end = start + play;
  let medals = 0;
  for (let index = 0; index < schedule.length; index += 1) {
    const band = schedule[index];
    const upper = schedule[index + 1]?.fromGame ?? Infinity;
    medals += Math.max(0, Math.min(end, upper) - Math.max(start, band.fromGame)) * band.medalsPerGame;
  }
  if (!Number.isFinite(medals)) throw new Error('Invalid normal investment');
  return medals;
}
