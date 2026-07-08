"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Axis, AxisValue, Conditions, Machine, PivotConfig } from "@/lib/ev/types";
import { computeAnchors, defaultConditions, generateRows } from "@/lib/ev/calc";
import { groupProfiles, resolveProfile } from "@/lib/ev/profiles";
import { AxisPicker } from "@/components/ev/AxisPicker";
import { ConditionsPanel } from "@/components/ev/ConditionsPanel";
import { EvTable } from "@/components/ev/EvTable";
import { EvFilter } from "@/components/ev/EvFilter";
import { FooterBar } from "@/components/ev/FooterBar";
import { ProfileBar } from "@/components/ev/ProfileBar";
import { RateSelector } from "@/components/ev/RateSelector";
import { ModeSelector, type AimMode } from "@/components/ev/ModeSelector";
import { SettingAimTable } from "@/components/ev/SettingAimTable";
import { AtPayoutTable } from "@/components/ev/AtPayoutTable";
import { HarakiriTable } from "@/components/ev/HarakiriTable";

type PickerState = {
  axis: Axis;
  mode: "select" | "pivot";
} | null;

// 台番号末尾（数字の最後の1桁）。"992"→"2"。
function tailOf(unit: string): string {
  const digits = unit.replace(/\D/g, "");
  return digits.length > 0 ? digits.slice(-1) : "";
}

// 日にち（DD部分）の数字。"2026-06-19"→"19"。"1のつく日"判定に使う。
function dayOfMonth(date: string): string {
  const m = /^\d{4}-\d{2}-(\d{2})$/.exec(date);
  return m ? String(Number(m[1])) : "";
}

type MachineDetailClientProps = {
  machine: Machine;
};

export function MachineDetailClient({ machine }: MachineDetailClientProps) {
  const grouped = useMemo(() => groupProfiles(machine.profiles), [machine.profiles]);
  const hasRatePairs = grouped.rates.length >= 2;
  const settingAim = machine.settingAim;
  const hasSettingAim = Boolean(settingAim && settingAim.units.length > 0);
  const atPayout = machine.atPayout;
  const hasAtPayout = Boolean(atPayout && atPayout.bands.length > 0);
  const harakiri = machine.harakiri;
  const hasHarakiri = Boolean(harakiri && harakiri.units.length > 0);
  const availableModes = useMemo<AimMode[]>(
    () => [
      "ev",
      ...(hasSettingAim ? (["setting"] as const) : []),
      ...(hasAtPayout ? (["payout"] as const) : []),
      ...(hasHarakiri ? (["harakiri"] as const) : [])
    ],
    [hasSettingAim, hasAtPayout, hasHarakiri]
  );

  const [mode, setMode] = useState<AimMode>("ev");
  const [activeGroupKey, setActiveGroupKey] = useState(grouped.groups[0].key);
  const [activeRate, setActiveRate] = useState<string | null>(grouped.defaultRate);
  const [selection, setSelection] = useState<Conditions>(() => defaultConditions(machine));
  const [pivotAxis, setPivotAxis] = useState<string | null>(null);
  const [pivotValues, setPivotValues] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [currentG, setCurrentG] = useState(0);
  const [picker, setPicker] = useState<PickerState>(null);
  const [evTail, setEvTail] = useState<string | null>(null); // 台番号末尾
  const [evDay, setEvDay] = useState<string | null>(null); // 日にちに含まれる数字（○のつく日）

  const group = grouped.groups.find((candidate) => candidate.key === activeGroupKey) ?? grouped.groups[0];
  const profile = resolveProfile(group, activeRate);

  // 絞り込み（台番号末尾/特定日）用の生サンプル。あれば EvTable を部分集合で再集計できる。
  const evSamples = profile.ev;
  const hasEvFilter = Boolean(evSamples && evSamples.hits.length > 0 && machine.evCalc);
  const evTailOptions = useMemo(
    () => (evSamples ? Array.from(new Set(evSamples.hits.map((h) => tailOf(h[0])))).filter(Boolean).sort() : []),
    [evSamples]
  );
  const evDayOptions = useMemo(
    () => (evSamples ? Array.from(new Set(evSamples.hits.flatMap((h) => dayOfMonth(h[1]).split("")))).sort() : []),
    [evSamples]
  );

  // 絞り込みが効いていれば、その台/日だけでアンカーを再集計した表示用プロファイルを作る。
  const displayProfile = useMemo(() => {
    if (!evSamples || !machine.evCalc || (evTail === null && evDay === null)) return profile;
    const keepUnitDate = (unit: string, date: string) =>
      (evTail === null || tailOf(unit) === evTail) && (evDay === null || dayOfMonth(date).includes(evDay));
    const hits = evSamples.hits.filter((h) => keepUnitDate(h[0], h[1]));
    const cens = evSamples.cens.filter((c) => keepUnitDate(c[0], c[1]));
    const baseAnchors = computeAnchors(hits, cens, machine.evCalc, evSamples.tai, evSamples.kan, evSamples.minSess);
    const end = baseAnchors.length > 0 ? baseAnchors[baseAnchors.length - 1].g : profile.gRange.start;
    return {
      ...profile,
      baseAnchors,
      zones: profile.zones.filter((zone) => zone.g <= end),
      gRange: { ...profile.gRange, end },
      totalPayout: hits.reduce((sum, h) => sum + h[3], 0),
      firstHitRate: hits.length ? Math.round(hits.reduce((sum, h) => sum + h[2], 0) / hits.length) : undefined
    };
  }, [profile, evSamples, machine.evCalc, evTail, evDay]);

  const evFiltered = displayProfile !== profile;
  const evFilterStats = useMemo(() => {
    if (!evFiltered || !evSamples) return { units: 0, hits: 0 };
    const keepUnitDate = (unit: string, date: string) =>
      (evTail === null || tailOf(unit) === evTail) && (evDay === null || dayOfMonth(date).includes(evDay));
    const hits = evSamples.hits.filter((h) => keepUnitDate(h[0], h[1]));
    return { units: new Set(hits.map((h) => h[0])).size, hits: hits.length };
  }, [evFiltered, evSamples, evTail, evDay]);
  // 絞り込み結果がアンカー2本未満（データ不足）かどうか。
  const evEmpty = evFiltered && displayProfile.baseAnchors.length < 2;

  const tabs = useMemo(
    () => grouped.groups.map((candidate) => ({ key: candidate.key, label: candidate.label, ceiling: candidate.ceiling })),
    [grouped.groups]
  );

  // When rate is handled by the selector, drop the (dummy) rate axis from the
  // conditions panel so it is not shown twice.
  const activeAxes = useMemo(() => {
    const keys = new Set(profile.activeAxes);
    return machine.axes.filter((axis) => keys.has(axis.key) && !(hasRatePairs && axis.key === "rate"));
  }, [hasRatePairs, machine.axes, profile.activeAxes]);

  const isPending = Boolean(profile.dataPending);
  const pivot = pivotAxis && pivotValues.length > 0 ? ({ axisKey: pivotAxis, values: pivotValues } satisfies PivotConfig) : undefined;
  const rows = useMemo(
    () => (isPending || evEmpty ? [] : generateRows(displayProfile, machine, selection, pivot)),
    [isPending, evEmpty, machine, pivot, displayProfile, selection]
  );

  function switchGroup(key: string): void {
    setActiveGroupKey(key);
    const nextGroup = grouped.groups.find((candidate) => candidate.key === key);
    const nextProfile = nextGroup ? resolveProfile(nextGroup, activeRate) : undefined;
    if (pivotAxis && nextProfile && !nextProfile.activeAxes.includes(pivotAxis)) {
      setPivotAxis(null);
      setPivotValues([]);
    }
    setCurrentG(nextProfile?.gRange.start ?? 0);
  }

  function applyValue(axis: Axis, value: AxisValue): void {
    setSelection((current) => ({ ...current, [axis.key]: value }));
    if (pivotAxis === axis.key) {
      setPivotAxis(null);
      setPivotValues([]);
    }
    setPicker(null);
  }

  function applyPivot(axis: Axis, values: string[]): void {
    setPivotAxis(axis.key);
    setPivotValues(values);
    setPicker(null);
  }

  return (
    <div className="app-shell">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-panel px-4">
        <Link href="/machines" className="text-xs text-ink-soft">
          ← 一覧
        </Link>
        <div className="truncate px-3 text-center text-xs font-bold">{machine.name}</div>
        <div className="mono text-lg text-ink-soft">...</div>
      </header>

      {availableModes.length > 1 ? <ModeSelector value={mode} onChange={setMode} modes={availableModes} /> : null}

      {mode === "setting" && settingAim ? (
        <SettingAimTable aim={settingAim} />
      ) : mode === "payout" && atPayout ? (
        <AtPayoutTable data={atPayout} />
      ) : mode === "harakiri" && harakiri ? (
        <HarakiriTable harakiri={harakiri} />
      ) : (
        <>
      <ProfileBar tabs={tabs} activeKey={activeGroupKey} onChange={switchGroup} />
      {hasRatePairs ? <RateSelector rates={grouped.rates} value={activeRate} onChange={setActiveRate} /> : null}
      {hasEvFilter && !isPending ? (
        <EvFilter
          tailOptions={evTailOptions}
          dayOptions={evDayOptions}
          tail={evTail}
          day={evDay}
          onTailChange={setEvTail}
          onDayChange={setEvDay}
          units={evFilterStats.units}
          hits={evFilterStats.hits}
        />
      ) : null}

      {isPending ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
          <div>
            <div className="text-sm font-bold text-neg">実戦データなし</div>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              「{group.label}」の実戦データはまだありません。
              <br />
              集計でき次第、期待値を表示します。
            </p>
          </div>
        </div>
      ) : evEmpty ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
          <p className="text-xs leading-relaxed text-muted">
            該当する台／日のデータが足りません。
            <br />
            （アンカーを作るには当たり{evSamples?.minSess ?? 15}件以上が必要です）
          </p>
        </div>
      ) : (
        <>
          {activeAxes.length > 0 ? (
            <ConditionsPanel
              axes={activeAxes}
              selection={selection}
              pivotAxis={pivotAxis}
              pivotValues={pivotValues}
              collapsed={collapsed}
              onToggleCollapsed={() => setCollapsed((value) => !value)}
              onOpenPicker={(axis, mode) => setPicker({ axis, mode })}
            />
          ) : null}
          <EvTable machine={machine} profile={displayProfile} rows={rows} pivot={pivot} onViewGChange={setCurrentG} />
          <FooterBar profile={displayProfile} rowCount={rows.length} currentG={currentG} />
        </>
      )}
        </>
      )}

      {picker ? (
        <AxisPicker
          axis={picker.axis}
          mode={picker.mode}
          value={selection[picker.axis.key] ?? picker.axis.default}
          pivotValues={pivotAxis === picker.axis.key ? pivotValues : []}
          onClose={() => setPicker(null)}
          onApplyValue={(value) => applyValue(picker.axis, value)}
          onApplyPivot={(values) => applyPivot(picker.axis, values)}
        />
      ) : null}
    </div>
  );
}
