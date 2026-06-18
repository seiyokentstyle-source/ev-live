"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Axis, AxisValue, Conditions, Machine, PivotConfig } from "@/lib/ev/types";
import { defaultConditions, generateRows } from "@/lib/ev/calc";
import { groupProfiles, resolveProfile } from "@/lib/ev/profiles";
import { AxisPicker } from "@/components/ev/AxisPicker";
import { ConditionsPanel } from "@/components/ev/ConditionsPanel";
import { EvTable } from "@/components/ev/EvTable";
import { FooterBar } from "@/components/ev/FooterBar";
import { ProfileBar } from "@/components/ev/ProfileBar";
import { RateSelector } from "@/components/ev/RateSelector";
import { ModeSelector, type AimMode } from "@/components/ev/ModeSelector";
import { SettingAimTable } from "@/components/ev/SettingAimTable";

type PickerState = {
  axis: Axis;
  mode: "select" | "pivot";
} | null;

type MachineDetailClientProps = {
  machine: Machine;
};

export function MachineDetailClient({ machine }: MachineDetailClientProps) {
  const grouped = useMemo(() => groupProfiles(machine.profiles), [machine.profiles]);
  const hasRatePairs = grouped.rates.length >= 2;
  const settingAim = machine.settingAim;
  const hasSettingAim = Boolean(settingAim && settingAim.units.length > 0);

  const [mode, setMode] = useState<AimMode>("ev");
  const [activeGroupKey, setActiveGroupKey] = useState(grouped.groups[0].key);
  const [activeRate, setActiveRate] = useState<string | null>(grouped.defaultRate);
  const [selection, setSelection] = useState<Conditions>(() => defaultConditions(machine));
  const [pivotAxis, setPivotAxis] = useState<string | null>(null);
  const [pivotValues, setPivotValues] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [currentG, setCurrentG] = useState(0);
  const [picker, setPicker] = useState<PickerState>(null);

  const group = grouped.groups.find((candidate) => candidate.key === activeGroupKey) ?? grouped.groups[0];
  const profile = resolveProfile(group, activeRate);

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
    () => (isPending ? [] : generateRows(profile, machine, selection, pivot)),
    [isPending, machine, pivot, profile, selection]
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

      {hasSettingAim ? <ModeSelector value={mode} onChange={setMode} /> : null}

      {mode === "setting" && settingAim ? (
        <SettingAimTable aim={settingAim} />
      ) : (
        <>
      <ProfileBar tabs={tabs} activeKey={activeGroupKey} onChange={switchGroup} />
      {hasRatePairs ? <RateSelector rates={grouped.rates} value={activeRate} onChange={setActiveRate} /> : null}

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
          <EvTable machine={machine} profile={profile} rows={rows} pivot={pivot} onViewGChange={setCurrentG} />
          <FooterBar profile={profile} rowCount={rows.length} currentG={currentG} />
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
