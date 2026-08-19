"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Axis, AxisValue, Conditions, Machine, PivotConfig } from "@/lib/ev/types";
import { computeAnchors, defaultConditions, generateRows } from "@/lib/ev/calc";
import { groupProfiles, resolveProfile } from "@/lib/ev/profiles";
import { AxisPicker } from "@/components/ev/AxisPicker";
import { ConditionsBar } from "@/components/ev/ConditionsBar";
import { TheoreticalTable } from "@/components/ev/TheoreticalTable";
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

// 道中CZ回数のバケット（旧形式データの再集計用）。undefined→""（CZ情報なし・絞り込み対象外）。
// 新形式は回数ちょうどで絞るので、そのまま回数を返す。
function czBucket(cz: number | undefined): string {
  if (cz === undefined) return "";
  return String(cz);
}

// CZ状態＝現在Gまでに（連チャン境界超で）当選した道中の当たり回数。
// 呼び名は機種で変わる（既定CZ / マギレコはBB）ので term を受け取る。
function czLabel(bucket: string, term: string): string {
  if (bucket === "0") return `${term}0回(天井狙い)`;
  return `${term}${bucket}回後`;   // 回数ちょうどで絞る（以前は2を「2回以上」とまとめていた）
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
  // 上位の切替: 店舗別データ（実戦データ）/ 設定1想定（スペックからの理論値）
  const [dataView, setDataView] = useState<"hall" | "theory">("hall");
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
  const [evCz, setEvCz] = useState<string | null>(null); // 初当りまでの道中CZ回数（"0"/"1"/"2"=2以上）
  const [evPay, setEvPay] = useState<string | null>(null); // 前回ATの獲得枚数の帯（下限枚数）

  const group = grouped.groups.find((candidate) => candidate.key === activeGroupKey) ?? grouped.groups[0];
  const profile = resolveProfile(group, activeRate);

  // 絞り込み（末尾/日/CZ）。新形式=公開前に集計済みの evFilters テーブルを引くだけ（生サンプル非公開）。
  // 旧形式（後方互換）=生サンプル ev.hits からクライアント再集計。データ再生成までは旧形式で動く。
  const evFilters = profile.evFilters;
  const evSamples = profile.ev;
  const useFilters = Boolean(evFilters);
  const hasEvFilter = useFilters
    ? Boolean(evFilters && (evFilters.tails.length || evFilters.days.length || evFilters.cz.length
        || (evFilters.pay?.length ?? 0)))
    : Boolean(evSamples && evSamples.hits.length > 0 && machine.evCalc);
  const evTailOptions = useMemo(
    () =>
      useFilters
        ? evFilters!.tails
        : evSamples
          ? Array.from(new Set(evSamples.hits.map((h) => tailOf(h[0])))).filter(Boolean).sort()
          : [],
    [useFilters, evFilters, evSamples]
  );
  const evDayOptions = useMemo(
    () =>
      useFilters
        ? evFilters!.days
        : evSamples
          ? Array.from(new Set(evSamples.hits.flatMap((h) => dayOfMonth(h[1]).split("")))).sort()
          : [],
    [useFilters, evFilters, evSamples]
  );
  const evCzOptions = useMemo(
    () =>
      useFilters
        ? evFilters!.cz
        : evSamples
          ? Array.from(new Set(evSamples.hits.map((h) => czBucket(h[4])))).filter(Boolean).sort()
          : [],
    [useFilters, evFilters, evSamples]
  );
  const hasCzFilter = evCzOptions.length > 0;
  // 道中の当たりの呼び名。データに無ければ従来どおり CZ。
  const czTerm = evFilters?.czTerm ?? "CZ";
  const czLabelOf = (bucket: string) => czLabel(bucket, czTerm);
  // 前回AT獲得（帯の下限枚数）。候補もラベルも生成側が配るので表示するだけ。
  const evPayOptions = useFilters ? (evFilters?.pay ?? []) : [];
  const payLabelOf = (v: string) => evFilters?.payLabels?.[v] ?? `${v}枚〜`;

  // 選択(末尾/日/CZ)→キー（順序 t→d→c。例 末尾7×CZ1回='t7c1'）。全nullは素の全体。
  // 順序 t→d→c→p。生成側が同じ順でキーを作っている。
  const filterKey = (evTail ? `t${evTail}` : "") + (evDay ? `d${evDay}` : "")
    + (evCz ? `c${evCz}` : "") + (evPay ? `p${evPay}` : "");

  // 絞り込みが効いていれば、その条件の表示用プロファイルを作る。
  const displayProfile = useMemo(() => {
    if (evTail === null && evDay === null && evCz === null && evPay === null) return profile;
    if (useFilters) {
      const tbl = evFilters!.tables[filterKey];
      if (!tbl) return { ...profile, baseAnchors: [], gRange: { ...profile.gRange, end: profile.gRange.start } };
      // start は「その回数に達するG」。手前は母数が無いので表に出さない（アンカーが無いのに
      // 0Gから最初のアンカー値で埋めると、あり得ない条件の期待値を描いてしまう）。
      const start = tbl.start ?? profile.gRange.start;
      return {
        ...profile,
        baseAnchors: tbl.baseAnchors,
        zones: profile.zones.filter((zone) => zone.g >= start && zone.g <= tbl.end),
        gRange: { ...profile.gRange, start, end: tbl.end },
        totalPayout: tbl.totalPayout,
        firstHitRate: tbl.firstHitRate ?? undefined
      };
    }
    // 旧形式：生サンプルから再集計
    if (!evSamples || !machine.evCalc) return profile;
    const keepUnitDate = (unit: string, date: string) =>
      (evTail === null || tailOf(unit) === evTail) && (evDay === null || dayOfMonth(date).includes(evDay));
    const hits = evSamples.hits.filter((h) => keepUnitDate(h[0], h[1]) && (evCz === null || czBucket(h[4]) === evCz));
    const cens = evCz === null ? evSamples.cens.filter((c) => keepUnitDate(c[0], c[1])) : [];
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
  }, [profile, useFilters, evFilters, filterKey, evSamples, machine.evCalc, evTail, evDay, evCz, evPay]);

  const evFiltered = displayProfile !== profile;
  const evFilterStats = useMemo(() => {
    if (!evFiltered) return { units: 0, hits: 0 };
    if (useFilters) {
      const tbl = evFilters!.tables[filterKey];
      return tbl ? { units: tbl.units, hits: tbl.hits } : { units: 0, hits: 0 };
    }
    if (!evSamples) return { units: 0, hits: 0 };
    const keepUnitDate = (unit: string, date: string) =>
      (evTail === null || tailOf(unit) === evTail) && (evDay === null || dayOfMonth(date).includes(evDay));
    const hits = evSamples.hits.filter((h) => keepUnitDate(h[0], h[1]) && (evCz === null || czBucket(h[4]) === evCz));
    return { units: new Set(hits.map((h) => h[0])).size, hits: hits.length };
  }, [evFiltered, useFilters, evFilters, filterKey, evSamples, evTail, evDay, evCz, evPay]);
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

      {machine.theoretical ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-3 py-2">
          <span className="mono shrink-0 text-[9px] tracking-[0.14em] text-muted">データ</span>
          <div className="flex overflow-hidden rounded-md border border-line">
            <button
              type="button"
              aria-pressed={dataView === "hall"}
              onClick={() => setDataView("hall")}
              className={`px-3 py-1 text-xs font-bold ${dataView === "hall" ? "bg-[rgba(255,204,68,0.12)] text-highlight" : "bg-panel-2 text-ink-soft"}`}
            >
              店舗別データ
            </button>
            <button
              type="button"
              aria-pressed={dataView === "theory"}
              onClick={() => setDataView("theory")}
              className={`border-l border-line px-3 py-1 text-xs font-bold ${dataView === "theory" ? "bg-[rgba(255,204,68,0.12)] text-highlight" : "bg-panel-2 text-ink-soft"}`}
            >
              設定1想定
            </button>
          </div>
        </div>
      ) : null}

      {dataView === "theory" && machine.theoretical ? (
        <TheoreticalTable
          data={machine.theoretical}
          gamesPerHour={machine.economics.gamesPerHour}
          breakEven={machine.breakEven?.[activeRate ?? "4652"] ?? 100}
        />
      ) : (
        <>
      {availableModes.length > 1 ? <ModeSelector value={mode} onChange={setMode} modes={availableModes} /> : null}

      <ConditionsBar
        machine={machine}
        mode={mode}
        rateLabel={grouped.rates.find((r) => r.value === activeRate)?.label ?? activeRate}
        czLabel={hasCzFilter ? (evCz === null ? (evFilters?.czAll ?? czLabelOf("0")) : czLabelOf(evCz)) : null}
        czTerm={czTerm}
        ceilingText={profile.ceiling}
        profileSessions={evFiltered ? evFilterStats.hits : displayProfile.sessions ?? null}
      />

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
          czOptions={hasCzFilter ? evCzOptions : undefined}
          czLabelFn={czLabelOf}
          czTerm={czTerm}
          czAllLabel={useFilters ? (evFilters?.czAll ?? czLabelOf("0")) : "全部"}
          payOptions={evPayOptions.length > 0 ? evPayOptions : undefined}
          payLabelFn={payLabelOf}
          payAllLabel={evFilters?.payAll ?? "前ATを問わない"}
          pay={evPay}
          onPayChange={setEvPay}
          tail={evTail}
          day={evDay}
          cz={evCz}
          onTailChange={setEvTail}
          onDayChange={setEvDay}
          onCzChange={setEvCz}
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
