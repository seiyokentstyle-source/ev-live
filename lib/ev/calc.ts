import type { Conditions, Machine, PivotConfig, Profile, TableRow } from "./types";

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

export function hourlyEV(g: number, ev: number, profile: Profile, machine: Machine): number {
  const remain = Math.max(0, profile.gRange.end - g);
  if (remain <= 0) return 0;
  const hours = remain / machine.economics.gamesPerHour;
  if (hours <= 0) return 0;
  return Math.round(ev / hours);
}

export function avgMedals(g: number, profile: Profile, machine: Machine): number {
  const remain = Math.max(0, profile.gRange.end - g);
  return Math.round(remain * machine.economics.medalsPerGame);
}

export function calcRow(g: number, conditions: Conditions, profile: Profile, machine: Machine): TableRow {
  const ev = calcEV(g, conditions, profile, machine);
  const rtp = adjustedRtp(g, conditions, ev, profile, machine);
  const hourly = hourlyEV(g, ev, profile, machine);
  const medals = avgMedals(g, profile, machine);
  const zoneLabel = profile.zones.find((zone) => zone.g === g)?.label;
  return { g, ev, rtp, hourly, medals, zoneLabel };
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
