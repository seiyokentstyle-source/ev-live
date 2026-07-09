import type { BaseAnchor, Conditions, EvCalc, EvSamples, Machine, PivotConfig, Profile, TableRow } from "./types";

// scraper/make_evlive_data.py の forward_anchors と同じ式。絞り込み（台番号末尾/特定日）で
// 部分集合のアンカーをクライアント側で再集計するために移植したもの。
export function computeAnchors(
  hits: EvSamples["hits"],
  cens: EvSamples["cens"],
  calc: EvCalc,
  tai: number,
  kan: number,
  minSess: number
): BaseAnchor[] {
  const anchors: BaseAnchor[] = [];
  // 前兆補正：打ち始め(g)から前兆Gは当たらない＝当たり判定を g+preg 以上にする。
  // 投資は減らさない（前兆分も回して払う）ので投資は実G基準の (初当りG - g) のまま。
  const preg = calc.preg ?? 0;
  const maxHitG = hits.reduce((m, h) => Math.max(m, h[2]), 0);
  const gTop = calc.ceiling || maxHitG;
  for (let g = 0; g <= gTop; g += calc.step) {
    let subN = 0;
    let invMed = 0;
    let payMed = 0;
    for (const h of hits) {
      if (h[2] >= g + preg) {
        subN += 1;
        invMed += (h[2] - g) * calc.use;
        payMed += h[3];
      }
    }
    let cenN = 0;
    for (const c of cens) {
      if (c[2] >= g) {
        cenN += 1;
        invMed += (c[2] - g) * calc.use;
      }
    }
    if (subN < minSess) break; // 当たりサンプルが薄いG帯から先は出さない
    const n = subN + cenN;
    const meanInv = (invMed * tai) / n;
    const meanRet = (payMed * kan) / n;
    if (meanInv < 1) break;
    const ev = Math.round(meanRet - meanInv);
    let rtp = Math.round((1000 * meanRet) / meanInv) / 10;
    rtp = ev >= 0 ? Math.max(rtp, 100) : Math.min(rtp, 99.9);
    const inv = Math.round(invMed / n);
    const atG = calc.junzou ? payMed / calc.junzou : 0;
    const playG = Math.round((invMed / calc.use + atG) / n);
    anchors.push({ g, ev, rtp, n, inv, playG });
  }
  return anchors;
}

export function baseEV(g: number, profile: Profile): number {
  const anchors = profile.baseAnchors;
  if (g <= anchors[0].g) return anchors[0].ev;
  if (g >= anchors[anchors.length - 1].g) return anchors[anchors.length - 1].ev;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const current = anchors[i];
    const next = anchors[i + 1];
    if (g >= current.g && g <= next.g) {
      const t = (g - current.g) / (next.g - current.g);
      return current.ev + (next.ev - current.ev) * t;
    }
  }

  return 0;
}

export function baseRtp(g: number, profile: Profile): number {
  const anchors = profile.baseAnchors;
  if (g <= anchors[0].g) return anchors[0].rtp;
  if (g >= anchors[anchors.length - 1].g) return anchors[anchors.length - 1].rtp;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const current = anchors[i];
    const next = anchors[i + 1];
    if (g >= current.g && g <= next.g) {
      const t = (g - current.g) / (next.g - current.g);
      return current.rtp + (next.rtp - current.rtp) * t;
    }
  }

  return 100;
}

export function calcEV(g: number, conditions: Conditions, profile: Profile, machine: Machine): number {
  let ev = baseEV(g, profile);
  const activeKeys = new Set(profile.activeAxes);

  for (const axis of machine.axes) {
    if (!activeKeys.has(axis.key)) continue;
    const value = conditions[axis.key] ?? axis.default;

    if (axis.type === "number") {
      if (axis.key === "credit") {
        const rate = String(conditions.rate ?? "50");
        ev += Number(value || 0) * (machine.creditValue[rate] ?? 0);
      }
      continue;
    }

    const modifier = machine.modifiers[axis.key]?.[String(value)];
    if (modifier !== undefined) {
      ev += modifier;
    }
  }

  return Math.round(ev);
}

export function adjustedRtp(
  g: number,
  conditions: Conditions,
  totalEv: number,
  profile: Profile,
  machine: Machine
): number {
  const base = baseRtp(g, profile);
  const remain = Math.max(0, profile.gRange.end - g);
  if (remain <= 0) return base;

  const rate = String(conditions.rate ?? "50");
  const medalValue = machine.creditValue[rate] ?? 20;
  const totalInvest = remain * machine.economics.medalsPerGame * medalValue;
  if (totalInvest <= 0) return base;

  const evDelta = totalEv - baseEV(g, profile);
  return base + (evDelta / totalInvest) * 100;
}

export function basePlayG(g: number, profile: Profile): number {
  const anchors = profile.baseAnchors;
  if (g <= anchors[0].g) return anchors[0].playG ?? 0;
  if (g >= anchors[anchors.length - 1].g) return anchors[anchors.length - 1].playG ?? 0;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const current = anchors[i];
    const next = anchors[i + 1];
    if (g >= current.g && g <= next.g) {
      const t = (g - current.g) / (next.g - current.g);
      return (current.playG ?? 0) + ((next.playG ?? 0) - (current.playG ?? 0)) * t;
    }
  }

  return 0;
}

export function hourlyEV(g: number, ev: number, profile: Profile, machine: Machine): number {
  // 新データ: アンカーの playG（1セッション消化G＝当たりまで＋AT中）で消化時間を出す。
  // 旧データ(playG 無し): 天井までの時間で近似（従来動作）。
  const usePlayG = profile.baseAnchors.some((anchor) => anchor.playG !== undefined);
  const games = usePlayG ? basePlayG(g, profile) : Math.max(0, profile.gRange.end - g);
  if (games <= 0) return 0;
  const hours = games / machine.economics.gamesPerHour;
  if (hours <= 0) return 0;
  return Math.round(ev / hours);
}

export function baseInv(g: number, profile: Profile): number {
  const anchors = profile.baseAnchors;
  if (g <= anchors[0].g) return anchors[0].inv ?? 0;
  if (g >= anchors[anchors.length - 1].g) return anchors[anchors.length - 1].inv ?? 0;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const current = anchors[i];
    const next = anchors[i + 1];
    if (g >= current.g && g <= next.g) {
      const t = (g - current.g) / (next.g - current.g);
      return (current.inv ?? 0) + ((next.inv ?? 0) - (current.inv ?? 0)) * t;
    }
  }

  return 0;
}

export function avgMedals(g: number, profile: Profile, machine: Machine): number {
  // 新データ: アンカーの inv（当たりまでの平均投資枚数＝機械割と同じ基準）を補間する。
  // 旧データ(inv 無し): 天井までの投資で近似（従来動作）。
  if (profile.baseAnchors.some((anchor) => anchor.inv !== undefined)) {
    return Math.round(baseInv(g, profile));
  }
  const remain = Math.max(0, profile.gRange.end - g);
  return Math.round(remain * machine.economics.medalsPerGame);
}

export function calcRow(g: number, conditions: Conditions, profile: Profile, machine: Machine): TableRow {
  const ev = calcEV(g, conditions, profile, machine);
  const rtp = adjustedRtp(g, conditions, ev, profile, machine);
  const hourly = hourlyEV(g, ev, profile, machine);
  const medals = avgMedals(g, profile, machine);
  const zoneLabel = profile.zones.find((zone) => zone.g === g)?.label;
  const anchors = profile.baseAnchors;
  const lastSampledG = anchors.length > 0 ? anchors[anchors.length - 1].g : Number.POSITIVE_INFINITY;
  const noData = g > lastSampledG;
  // Sample size belongs to the anchor at this exact G; interpolated rows (and older data) have none.
  const n = anchors.find((anchor) => anchor.g === g)?.n;
  return { g, ev, rtp, hourly, medals, zoneLabel, n, noData };
}

export function generateGValues(profile: Profile): number[] {
  const values: number[] = [];
  const { start, end, step } = profile.gRange;
  for (let g = start; g <= end; g += step) {
    values.push(g);
  }
  if (values[values.length - 1] !== end) {
    values.push(end);
  }
  return values;
}

export function generateRows(
  profile: Profile,
  machine: Machine,
  conditions: Conditions,
  pivot?: PivotConfig
): TableRow[] {
  return generateGValues(profile).map((g) => {
    const row = calcRow(g, conditions, profile, machine);
    if (!pivot) return row;

    const pivotValues: Record<string, number> = {};
    for (const value of pivot.values) {
      pivotValues[value] = calcEV(g, { ...conditions, [pivot.axisKey]: value }, profile, machine);
    }

    return { ...row, pivotValues };
  });
}

export function defaultConditions(machine: Machine): Conditions {
  return Object.fromEntries(machine.axes.map((axis) => [axis.key, axis.default]));
}
