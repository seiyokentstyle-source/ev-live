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
  // 投資は減らさない（前兆分も回して払う）ので投資は実G基準のまま。
  const preg = calc.preg ?? 0;
  const maxHitG = hits.reduce((m, h) => Math.max(m, h[2]), 0);
  const gTop = calc.ceiling || maxHitG;

  // AT間モデル：hitsに投入G0(6要素目)がある機種は、やめ想定込みの通常時投入で集計する
  // （scraperのforward_anchors AT間分岐と同じ式）。打ち切りは含めない。
  // 機械割/期待値の定義は当たり間モデルと共通＝投資は貸単価・回収は換金単価
  // （46/52なら46枚投資=52枚回収で100%）。
  const atKan = Boolean(calc.bet) && hits.length > 0 && hits.every((h) => h[5] !== undefined);
  if (atKan) {
    for (let g = 0; g <= gTop; g += calc.step) {
      let n = 0;
      let invMed = 0; // 通常時投入(枚)
      let pay = 0; // AT獲得(枚)
      let toukyuuG = 0; // 通常時投入G合計
      for (const h of hits) {
        if (h[2] >= g + preg) {
          n += 1;
          const invG = Math.max(0, (h[5] as number) - g); // 投入G0 - g
          toukyuuG += invG;
          invMed += invG * calc.use;
          pay += h[3];
        }
      }
      if (n < minSess) break;
      const shouka = toukyuuG + (calc.junzou ? pay / calc.junzou : 0); // 消化G(通常時＋AT中・時給用)
      const invTotal = invMed * tai; // 投資(円)＝通常時投入枚×貸単価
      const retTotal = pay * kan; // 回収(円)＝AT獲得枚×換金単価
      if (invTotal < 1) break;
      const ev = Math.round((retTotal - invTotal) / n);
      let rtp = Math.round((1000 * retTotal) / invTotal) / 10;
      rtp = ev >= 0 ? Math.max(rtp, 100) : Math.min(rtp, 99.9);
      anchors.push({ g, ev, rtp, n, inv: Math.round(invMed / n), playG: Math.round(shouka / n) });
    }
    return anchors;
  }

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
  const evDelta = totalEv - baseEV(g, profile);
  if (evDelta === 0) return base;

  // 機械割は枚ベース OUT/IN（分母＝賭け枚数×総消化G）。条件で期待値が動いた分は
  // 円→枚（換金単価で割る）に戻してから、同じ分母で割り戻す。
  const rate = String(conditions.rate ?? "50");
  const medalValue = machine.creditValue[rate] ?? 20;
  const bet = machine.evCalc?.bet ?? 3;
  const totalIn = bet * basePlayG(g, profile);
  if (totalIn <= 0 || medalValue <= 0) return base;

  return base + ((evDelta / medalValue) / totalIn) * 100;
}

// ±0になる機械割。行ごとに違うので rtp/inv と同じように補間する。
export function baseBreakEven(g: number, profile: Profile): number | undefined {
  const anchors = profile.baseAnchors;
  if (anchors.length === 0 || anchors[0].be === undefined) return undefined;
  if (g <= anchors[0].g) return anchors[0].be;
  if (g >= anchors[anchors.length - 1].g) return anchors[anchors.length - 1].be;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const current = anchors[i];
    const next = anchors[i + 1];
    if (g >= current.g && g <= next.g) {
      const t = (g - current.g) / (next.g - current.g);
      return (current.be ?? 0) + ((next.be ?? 0) - (current.be ?? 0)) * t;
    }
  }
  return undefined;
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
  return { g, ev, rtp, hourly, medals, zoneLabel, n, noData, be: baseBreakEven(g, profile) };
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
