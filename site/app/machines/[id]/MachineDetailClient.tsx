"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Axis, AxisValue, Conditions, Machine, PivotConfig, FilterAxis } from "@/lib/ev/types";
import type { Hall } from "@/lib/halls";
import { computeAnchors, defaultConditions, generateRows } from "@/lib/ev/calc";
import { groupProfiles, resolveProfile, rewriteAxisLabel } from "@/lib/ev/profiles";
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
import { ControlBar, SegmentedControl } from "@/components/ui/Controls";
import { EmptyState } from "@/components/ui/DataTable";

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
  /** どの店舗のデータを見ているか。ヘッダーの表示と戻り先に使う. */
  hall: Hall;
};

export function MachineDetailClient({ machine, hall }: MachineDetailClientProps) {
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
  // 絞り込みは軸key→選択値の1本にまとめる。軸が増えても state を足す必要がない。
  const [evSel, setEvSel] = useState<Record<string, string | null>>({});

  const group = grouped.groups.find((candidate) => candidate.key === activeGroupKey) ?? grouped.groups[0];
  const profile = resolveProfile(group, activeRate);

  // 絞り込みは公開前に集計済みの evFilters テーブルを引くだけ（生サンプルは公開しない）。
  // 軸の定義（並び順・ラベル・候補）はデータ側が配るので、軸が増えてもここは無改修。
  const evFilters = profile.evFilters;
  const evSamples = profile.ev;
  const useFilters = Boolean(evFilters);
  // 道中の当たりの呼び名。データに無ければ従来どおり CZ。
  const czTerm = evFilters?.czTerm ?? "CZ";

  // 軸の一覧。新形式は axes をそのまま使い、旧データは従来のフィールドから組み立てる。
  const evAxes: FilterAxis[] = useMemo(() => {
    // 見出しだけ現在の表記に直す（データ再生成を待たずに文言を反映するため）。
    if (evFilters?.axes?.length) {
      return evFilters.axes.map((axis) => ({ ...axis, label: rewriteAxisLabel(axis.label) }));
    }
    const out: FilterAxis[] = [];
    const tails = useFilters
      ? evFilters!.tails
      : Array.from(new Set((evSamples?.hits ?? []).map((h) => tailOf(h[0])))).filter(Boolean).sort();
    const days = useFilters
      ? evFilters!.days
      : Array.from(new Set((evSamples?.hits ?? []).flatMap((h) => dayOfMonth(h[1]).split("")))).sort();
    const czs = useFilters
      ? evFilters!.cz
      : Array.from(new Set((evSamples?.hits ?? []).map((h) => czBucket(h[4])))).filter(Boolean).sort();
    if (tails.length) out.push({ key: "t", label: "末尾", allLabel: "全部", options: tails.map((v) => ({ value: v, label: `末尾${v}` })) });
    if (days.length) out.push({ key: "d", label: "特定日", allLabel: "全日", options: days.map((v) => ({ value: v, label: `${v}のつく日` })) });
    if (czs.length) {
      out.push({
        key: "c",
        label: `道中${czTerm}`,
        allLabel: evFilters?.czAll ?? czLabel("0", czTerm),
        options: czs.map((v) => ({ value: v, label: czLabel(v, czTerm) }))
      });
    }
    const pays = evFilters?.pay ?? [];
    if (pays.length) {
      out.push({
        key: "p",
        label: "前回AT",
        allLabel: evFilters?.payAll ?? "前ATを問わない",
        options: pays.map((v) => ({ value: v, label: evFilters?.payLabels?.[v] ?? `${v}枚〜` }))
      });
    }
    return out;
  }, [evFilters, evSamples, useFilters, czTerm]);

  const hasEvFilter = evAxes.length > 0 && (useFilters || Boolean(machine.evCalc));
  const setAxis = (key: string, value: string | null) => setEvSel((prev) => ({ ...prev, [key]: value }));

  // 選択→キー。axes の並び順に key+値 を連結する（生成側も同じ順で作っている）。
  const filterKey = evAxes.map((axis) => (evSel[axis.key] ? `${axis.key}${evSel[axis.key]}` : "")).join("");
  const anySelected = evAxes.some((axis) => evSel[axis.key] != null);
  const selOf = (key: string) => evSel[key] ?? null;

  // 絞り込みが効いていれば、その条件の表示用プロファイルを作る。
  const displayProfile = useMemo(() => {
    if (!anySelected) return profile;
    if (useFilters) {
      const tbl = evFilters!.tables[filterKey];
      if (!tbl) return { ...profile, baseAnchors: [], gRange: { ...profile.gRange, end: profile.gRange.start } };
      // start は「その条件に達するG」。手前は母数が無いので表に出さない（アンカーが無いのに
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
    // 旧形式：生サンプルから再集計（末尾/日/CZ のみ対応）
    if (!evSamples || !machine.evCalc) return profile;
    const keepUnitDate = (unit: string, date: string) =>
      (selOf("t") === null || tailOf(unit) === selOf("t")) &&
      (selOf("d") === null || dayOfMonth(date).includes(selOf("d") as string));
    const hits = evSamples.hits.filter((h) => keepUnitDate(h[0], h[1]) && (selOf("c") === null || czBucket(h[4]) === selOf("c")));
    const cens = selOf("c") === null ? evSamples.cens.filter((c) => keepUnitDate(c[0], c[1])) : [];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, useFilters, evFilters, filterKey, anySelected, evSamples, machine.evCalc, evSel]);

  const evFiltered = displayProfile !== profile;
  const evFilterStats = useMemo(() => {
    if (!evFiltered) return { units: 0, hits: 0 };
    if (useFilters) {
      const tbl = evFilters!.tables[filterKey];
      return tbl ? { units: tbl.units, hits: tbl.hits } : { units: 0, hits: 0 };
    }
    if (!evSamples) return { units: 0, hits: 0 };
    const keepUnitDate = (unit: string, date: string) =>
      (selOf("t") === null || tailOf(unit) === selOf("t")) &&
      (selOf("d") === null || dayOfMonth(date).includes(selOf("d") as string));
    const hits = evSamples.hits.filter((h) => keepUnitDate(h[0], h[1]) && (selOf("c") === null || czBucket(h[4]) === selOf("c")));
    return { units: new Set(hits.map((h) => h[0])).size, hits: hits.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evFiltered, useFilters, evFilters, filterKey, evSamples, evSel]);
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

  /* 表をスクロールしている間だけ上の操作バーを畳み、期待値表の可視領域を広げる。

     ★開き直すのに「0Gまで戻す」を強いない。指を下へ払って（＝表を戻る向きに
       スクロールして）少し動かせば、その場でバーが戻る。狙い方やレートを
       触りたくなるのは表の途中なので、先頭まで戻す操作は無駄が大きい。

     scroll イベントは bubble しないが capture 段では祖先にも届くので、どの表
     （期待値／設定狙い／AT獲得／ハラキリ／設定1想定）でも1か所で拾える。
     表側の onScroll（視点Gの追従）には触れないので、既存の挙動は変わらない。

     ★開閉の直後に短い錠を掛けている。バーが畳まれると表の領域が広がり、
       末尾に居るときは scrollTop がブラウザに切り詰められて「戻る向き」の
       scroll が発生する。錠が無いと、それを操作と誤読して開閉を繰り返す。 */
  const [barsCollapsed, setBarsCollapsed] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const lastTopRef = useRef(0);
  const lastMaxRef = useRef(-1);
  /* 見出し行を掴んで手で開閉したか。手で決めた状態は、先頭へ戻すまで
     自動判定で上書きしない（下へ少し送っただけで元に戻ると操作にならない）。 */
  const manualRef = useRef(false);
  const collapsedRef = useRef(false);
  const lockUntilRef = useRef(0);

  const applyCollapsed = useCallback((next: boolean) => {
    if (next === collapsedRef.current) return;
    collapsedRef.current = next;
    /* 折りたたみは320msかけて動く。動いている最中の高さ変化を操作と
       読まないよう、少し長めに錠を掛ける。 */
    lockUntilRef.current = Date.now() + 420;
    setBarsCollapsed(next);
  }, []);

  const handleScrollDepth = useCallback(
    (top: number, maxTop: number, barsHeight: number) => {
      /* ★高さが変わった瞬間の scroll は「操作」ではない。
         バーを畳むと表の領域が広がり、スクロールできる量（maxTop）が縮む。
         ブラウザはそのぶん scrollTop を切り詰めるので、戻る向きの scroll が
         発生する。これを操作と読むと、畳む→切り詰め→開く→…… と往復する。
         maxTop が動いた回は基準を取り直すだけにする。 */
      if (maxTop !== lastMaxRef.current) {
        lastMaxRef.current = maxTop;
        lastTopRef.current = top;
        return;
      }

      /* 末尾に着いている間も向きを見ない。iOS は末尾で引っ張れる（ラバーバンド）
         ため、指を離すと戻る向きの scroll が連続して出る。 */
      if (maxTop > 0 && top >= maxTop - 4) {
        lastTopRef.current = top;
        return;
      }

      const now = Date.now();
      if (now < lockUntilRef.current) {
        lastTopRef.current = top;
        return;
      }
      /* 指の微細な揺れで判定を走らせないよう、一定量動いてから見る。 */
      if (Math.abs(top - lastTopRef.current) < 8) return;
      lastTopRef.current = top;

      /* ★向きは見ない。位置だけで決める。
         「少し戻しただけで開く」方式は、天井から戻る途中で意図せず開いてしまう。
         開くのは先頭（0G付近）まで戻したときだけにする。
         戻る向きのスクロールを一切解釈しないので、慣性の跳ね返りや
         scrollTop の切り詰めが判定に混ざる余地も無くなる。 */
      if (top <= 24) {
        manualRef.current = false;
        applyCollapsed(false);
      } else if (manualRef.current) {
        /* 手で決めた状態を保つ。先頭まで戻せば自動判定に戻る。 */
      } else if (top > 88 && maxTop - top >= barsHeight) {
        /* ★畳むと表の領域が barsHeight ぶん広がる。残りのスクロール量が
           それより少ないと scrollTop が切り詰められ、見ている行が飛ぶ。
           「サイズは変わってよいが、表は動かない」を守るため、
           飛ばずに畳めるときだけ畳む。 */
        applyCollapsed(true);
      }
    },
    [applyCollapsed]
  );

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const onScroll = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target || typeof target.scrollTop !== "number") return;
      const bars = shell.querySelectorAll<HTMLElement>(".collapsible-bar");
      let barsHeight = 0;
      bars.forEach((bar) => {
        barsHeight += bar.offsetHeight;
      });
      handleScrollDepth(
        target.scrollTop,
        target.scrollHeight - target.clientHeight,
        barsHeight
      );
    };
    shell.addEventListener("scroll", onScroll, true);
    return () => shell.removeEventListener("scroll", onScroll, true);
  }, [handleScrollDepth]);

  /* ★見出し行（G数／機械割／…）を掴んで上下に振ると開閉する。
     0Gまで戻さなくても、いま見ている位置のまま狙い方や絞り込みを出せる。

     ★iOS Safari では touch-action:none だけでは表のスクロールが止まらない。
       touchmove を passive:false で受けて preventDefault する必要がある
       （Safari は touchmove を既定で passive 扱いにするので、明示しないと
       preventDefault が無視される）。しかも iOS はスクロールが始まった後の
       preventDefault を受け付けないため、最初の1回目から止める。
     ★マウスは pointerType で選り分ける。touch と両方を処理すると二重に走る。

     component を1つずつ触らずに済むよう、shell 側で thead を判定する。 */
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    let touchY: number | null = null;
    let mouseY: number | null = null;

    const onHeader = (target: EventTarget | null) =>
      Boolean((target as HTMLElement | null)?.closest?.("thead"));

    const decide = (dy: number) => {
      manualRef.current = true;
      /* 下へ下げる＝バーを引き出す（表は小さくなる）。上へ払う＝畳む。 */
      applyCollapsed(dy < 0);
    };

    const onTouchStart = (event: TouchEvent) => {
      touchY = onHeader(event.target) ? event.touches[0]?.clientY ?? null : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (touchY === null) return;
      /* 掴んでいる間は表を動かさない。1回目から止めないと iOS は聞かない。 */
      if (event.cancelable) event.preventDefault();
      const y = event.touches[0]?.clientY;
      if (y === undefined) return;
      const dy = y - touchY;
      if (Math.abs(dy) < 20) return;
      touchY = null;
      decide(dy);
    };
    const onTouchEnd = () => {
      touchY = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      mouseY = onHeader(event.target) ? event.clientY : null;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || mouseY === null) return;
      const dy = event.clientY - mouseY;
      if (Math.abs(dy) < 20) return;
      mouseY = null;
      decide(dy);
    };
    const onPointerEnd = () => {
      mouseY = null;
    };

    shell.addEventListener("touchstart", onTouchStart, { passive: true });
    shell.addEventListener("touchmove", onTouchMove, { passive: false });
    shell.addEventListener("touchend", onTouchEnd);
    shell.addEventListener("touchcancel", onTouchEnd);
    shell.addEventListener("pointerdown", onPointerDown);
    shell.addEventListener("pointermove", onPointerMove);
    shell.addEventListener("pointerup", onPointerEnd);
    shell.addEventListener("pointercancel", onPointerEnd);
    return () => {
      shell.removeEventListener("touchstart", onTouchStart);
      shell.removeEventListener("touchmove", onTouchMove);
      shell.removeEventListener("touchend", onTouchEnd);
      shell.removeEventListener("touchcancel", onTouchEnd);
      shell.removeEventListener("pointerdown", onPointerDown);
      shell.removeEventListener("pointermove", onPointerMove);
      shell.removeEventListener("pointerup", onPointerEnd);
      shell.removeEventListener("pointercancel", onPointerEnd);
    };
  }, [applyCollapsed]);

  /* 表を切り替えた直後は必ず開いた状態から始める（新しい表は先頭に居るため）。 */
  useEffect(() => {
    collapsedRef.current = false;
    manualRef.current = false;
    lastTopRef.current = 0;
    lastMaxRef.current = -1;
    lockUntilRef.current = 0;
    setBarsCollapsed(false);
  }, [mode, dataView, activeGroupKey, activeRate]);

  return (
    <div ref={shellRef} className={`app-shell ${barsCollapsed ? "bars-collapsed" : ""}`}>
      {/* 一覧ページのヘッダーと同じ骨格（左＝所在、中央＝見出し、右＝補助情報）にする。
          以前は右端に押しても何も起きない「...」が置かれていた。 */}
      <header className="grid h-12 shrink-0 grid-cols-[4rem_1fr_4rem] items-center border-b border-line bg-panel px-4">
        {/* 戻り先は機種一覧ではなく店舗選択。機種選択→店舗選択→各表 の順路をそのまま戻れるようにする。 */}
        <Link href={`/machines/${machine.id}`} className="mono text-[11px] text-ink-soft">
          ← 店舗
        </Link>
        <h1 className="truncate px-2 text-center text-sm font-bold">{machine.name}</h1>
        {/* 右端はメーカーではなく店舗名。どの店のデータを見ているかが常に見えるようにする。 */}
        <span className="mono truncate text-right text-[10px] text-muted">{hall.name}</span>
      </header>

      {machine.theoretical ? (
        <ControlBar label="データ" collapsible>
          <SegmentedControl
            segments={[
              { value: "hall", label: "店舗別データ", hint: "実戦値" },
              { value: "theory", label: "設定1想定", hint: "スペック理論値" }
            ]}
            value={dataView}
            onChange={setDataView}
          />
        </ControlBar>
      ) : null}

      {dataView === "theory" && machine.theoretical ? (
        <TheoreticalTable data={machine.theoretical} gamesPerHour={machine.economics.gamesPerHour} />
      ) : (
        <>
      {availableModes.length > 1 ? <ModeSelector value={mode} onChange={setMode} modes={availableModes} /> : null}

      <ConditionsBar
        machine={machine}
        mode={mode}
        rateLabel={grouped.rates.find((r) => r.value === activeRate)?.label ?? activeRate}
        czLabel={(() => {
          const axis = evAxes.find((a) => a.key === "c");
          if (!axis) return null;
          const v = evSel.c ?? null;
          return v === null ? axis.allLabel : axis.options.find((opt) => opt.value === v)?.label ?? v;
        })()}
        czTerm={czTerm}
        ceilingText={profile.ceiling}
        profileSessions={evFiltered ? evFilterStats.hits : displayProfile.sessions ?? null}
        profileSessionUnit={displayProfile.sessionUnit}
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
          axes={evAxes}
          values={evSel}
          onChange={setAxis}
          units={evFilterStats.units}
          hits={evFilterStats.hits}
          hitUnit={displayProfile.sessionUnit}
        />
      ) : null}

      {isPending ? (
        <EmptyState title="実戦データなし">
          「{group.label}」の実戦データはまだありません。
          <br />
          集計でき次第、期待値を表示します。
        </EmptyState>
      ) : evEmpty ? (
        <EmptyState>
          該当する台／日のデータが足りません。
          <br />
          （アンカーを作るには当たり{evSamples?.minSess ?? 15}件以上が必要です）
        </EmptyState>
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
