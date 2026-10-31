"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { HEATMAP_GROUP_KEYS, type FloorLayout, type HeatmapData, type HeatmapGroupKey } from "@/lib/heatmap/types";
import { averageNet, formatNet, groupLabel, heatColor, heatmapGroupDateRange, initialMapScroll, PENDING_HEAT_COLOR, summarizeUnits } from "@/lib/heatmap/values";
import styles from "./heatmap.module.css";

const BASE_WIDTH = 2300;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
const HALLS = {
  shinjuku: { title: "新宿", shortName: "新宿", subtitle: "ゴジラのお店" },
  akihabara: { title: "アイランド秋葉原", shortName: "アイランド", subtitle: "アイランド秋葉原" },
  kabuki: { title: "エスパス歌舞伎町", shortName: "歌舞伎町", subtitle: "エスパス歌舞伎町" },
} as const;
type HeatmapHallId = keyof typeof HALLS;

function dateRange(first?: string | null, last?: string | null) {
  if (!first || !last) return "対象データなし";
  return first === last ? first.replaceAll("-", "/") : `${first.replaceAll("-", "/")} 〜 ${last.replaceAll("-", "/")}`;
}

export function HeatmapClient({ data, floor, hallId = "shinjuku" }: { data: HeatmapData | null; floor: FloorLayout; hallId?: HeatmapHallId }) {
  const hall = HALLS[hallId];
  const missingLabel = hallId === "shinjuku" ? "履歴なし" : "履歴未確認";
  const [groupKey, setGroupKey] = useState<HeatmapGroupKey>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<"details" | "help" | "unplaced" | null>(null);
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const detailsButton = useRef<HTMLButtonElement>(null);
  const helpButton = useRef<HTMLButtonElement>(null);
  const unplacedButton = useRef<HTMLButtonElement>(null);
  const group = data?.groups.find((candidate) => candidate.key === groupKey);
  const units = useMemo(() => new Map(group?.units.map((unit) => [unit.unit, unit]) ?? []), [group]);
  const pendingUnits = useMemo(() => new Map(group?.pendingUnits?.map((unit) => [unit.unit, unit]) ?? []), [group]);
  const unplacedUnits = useMemo(() => {
    const mapped = new Set(floor.seats.map((seat) => seat.unit));
    return [...new Set([...units.keys(), ...pendingUnits.keys()])].filter((unit) => !mapped.has(unit)).sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
  }, [floor, units, pendingUnits]);
  const shownUnits = useMemo(() => floor.seats.flatMap((seat) => { const unit = units.get(seat.unit); return unit ? [unit] : []; }), [floor, units]);
  const pendingCount = floor.seats.filter((seat) => pendingUnits.has(seat.unit) && !units.has(seat.unit)).length;
  const missingCount = floor.seats.length - shownUnits.length - pendingCount;
  const range = heatmapGroupDateRange(group);
  const summary = summarizeUnits(shownUnits);
  const selection = selected ? units.get(selected) : undefined;
  const pendingSelection = selected && !selection ? pendingUnits.get(selected) : undefined;
  const boardWidth = BASE_WIDTH * zoom;
  const scale = boardWidth / floor.width;

  useEffect(() => {
    const element = viewport.current;
    if (element) element.scrollTo(initialMapScroll(floor, BASE_WIDTH, element.clientWidth));
  }, [floor]);

  function changeZoom(next: number) {
    const bounded = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const element = viewport.current;
    const centerX = element ? (element.scrollLeft + element.clientWidth / 2) / zoom : 0;
    const centerY = element ? (element.scrollTop + element.clientHeight / 2) / zoom : 0;
    setZoom(bounded);
    requestAnimationFrame(() => {
      if (element) element.scrollTo({ left: centerX * bounded - element.clientWidth / 2, top: centerY * bounded - element.clientHeight / 2 });
    });
  }

  function resetView() {
    setZoom(1);
    requestAnimationFrame(() => {
      const element = viewport.current;
      if (element) element.scrollTo(initialMapScroll(floor, BASE_WIDTH, element.clientWidth));
    });
  }

  function showOverview() {
    const element = viewport.current;
    if (!element) return;
    setZoom(Math.max(MIN_ZOOM, Math.min((element.clientWidth - 32) / BASE_WIDTH, (element.clientHeight - 32) / (floor.height * BASE_WIDTH / floor.width))));
    element.scrollTo({ top: 0, left: 0 });
  }

  function closePanel() {
    (openPanel === "details" ? detailsButton : openPanel === "unplaced" ? unplacedButton : helpButton).current?.focus();
    setOpenPanel(null);
  }

  function selectUnit(unit: string) {
    setSelected(unit);
    setOpenPanel("details");
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <Link href="/" className={styles.back}>← 機種一覧</Link>
          <h1>{hall.title} <span>台番号ヒートマップ</span></h1>
          <p>{hall.subtitle} · 平均差枚（推定）</p>
        </div>
        <span className={styles.brand} aria-label="EVOT"><span className="logo-gradient">EV</span>OT</span>
      </header>

      <nav className={styles.hallTabs} aria-label="ヒートマップの店舗">
        {(Object.entries(HALLS) as Array<[HeatmapHallId, typeof HALLS[HeatmapHallId]]>).map(([id, venue]) => (
          <Link key={id} href={`/halls/${id}/heatmap`} aria-label={venue.title} aria-current={id === hallId ? "page" : undefined}>{venue.shortName}</Link>
        ))}
      </nav>

      <section className={styles.controls} aria-label="表示条件">
        <label className={styles.filter} htmlFor="heatmap-date">日付
          <select id="heatmap-date" value={groupKey} onChange={(event) => setGroupKey(event.target.value as HeatmapGroupKey)}>
            {HEATMAP_GROUP_KEYS.map((key) => <option key={key} value={key}>{groupLabel(key)}</option>)}
          </select>
        </label>
        <div className={styles.period}>
          <p>{dateRange(range.firstDate, range.lastDate)}</p>
          <p>{`差枚あり ${shownUnits.length.toLocaleString("ja-JP")}台 · 未集計 ${pendingCount.toLocaleString("ja-JP")}台 · ${missingLabel} ${missingCount.toLocaleString("ja-JP")}台`}</p>
          <p>{`差枚集計 ${summary.days.toLocaleString("ja-JP")}台日 / 島図 ${floor.seats.length.toLocaleString("ja-JP")}台`}</p>
        </div>
      </section>

      {unplacedUnits.length > 0 && <div className={styles.unplacedBar}>
        <button type="button" ref={unplacedButton} aria-controls="heatmap-unplaced" aria-expanded={openPanel === "unplaced"} onClick={() => setOpenPanel(openPanel === "unplaced" ? null : "unplaced")}>配置未確認 <strong>{unplacedUnits.length.toLocaleString("ja-JP")}台</strong><span>台番号の一覧</span></button>
      </div>}

      <div className={styles.legend} aria-label="平均差枚の色凡例">
        <div className={styles.colorScale}>
          <div className={styles.colorBar} aria-hidden="true">{[-2000, -1000, -500, -1, 0, 1, 500, 1000, 2000].map((value) => <i key={value} style={{ background: heatColor(value).background }} />)}</div>
          <div className={styles.scaleLabels}><span>−2,000枚以下</span><span>0</span><span>＋2,000枚以上</span></div>
        </div>
        <div className={styles.legendStates}>
          <span className={styles.noDataKey}><i aria-hidden="true" style={{ background: PENDING_HEAT_COLOR.background }} />履歴あり・未集計</span>
          <span className={styles.noDataKey}><i aria-hidden="true" />{missingLabel}</span>
        </div>
      </div>

      <div className={styles.mapToolbar}>
        <div className={styles.panelControls}>
          <button type="button" ref={detailsButton} aria-controls="heatmap-details" aria-expanded={openPanel === "details"} onClick={() => setOpenPanel(openPanel === "details" ? null : "details")}>台の詳細{selected && <span>{selected}番台</span>}</button>
          <button type="button" ref={helpButton} aria-controls="heatmap-help" aria-expanded={openPanel === "help"} onClick={() => setOpenPanel(openPanel === "help" ? null : "help")}>使い方</button>
        </div>
        <div className={styles.zoomControls} aria-label="島図の拡大縮小">
          <button type="button" aria-label="島図を縮小" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(zoom - 0.25)}>−</button>
          <output aria-label="表示倍率">{Math.round(zoom * 100)}%</output>
          <button type="button" aria-label="島図を拡大" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom + 0.25)}>＋</button>
          <button type="button" className={styles.reset} onClick={showOverview}>全体</button>
          <button type="button" className={styles.reset} onClick={resetView}>戻す</button>
        </div>
      </div>

      <section id="heatmap-details" className={styles.infoPanel} hidden={openPanel !== "details"} aria-label="選択した台の詳細" aria-live="polite" aria-atomic="true" onKeyDown={(event) => { if (event.key === "Escape") closePanel(); }}>
        <div className={styles.panelHeader}><h2>台の詳細</h2><button type="button" onClick={closePanel} aria-label="台の詳細を閉じる">×</button></div>
        <div className={styles.detail}>
          {selected ? <><strong className={styles.unitTitle}>{selected}<span>番台</span></strong>{pendingSelection
            ? <div className={styles.pendingDetail}>
              <strong>履歴あり・差枚未集計</strong>
              <p>{pendingSelection.reasons.join(" / ")}</p>
              <p>{pendingSelection.days === null ? "履歴日数：重複期間があるため合算していません" : `履歴日数：${pendingSelection.days}日`} · {dateRange(pendingSelection.firstDate, pendingSelection.lastDate)}</p>
              {pendingSelection.overlappingPeriods?.map((period, index) => <p key={index}>{dateRange(period.firstDate, period.lastDate)}：{period.days}日（{period.reason}）</p>)}
            </div>
            : <><div><span className={styles.detailLabel}>平均差枚（推定）</span><strong>{formatNet(averageNet(selection))}</strong></div><div><span className={styles.detailLabel}>対象日数</span><strong>{selection ? `${selection.days}日` : "—"}</strong></div></>}</> : <p>台番号を選ぶと、差枚や履歴の状況を表示します。</p>}
        </div>
      </section>

      <section id="heatmap-help" className={`${styles.infoPanel} ${styles.helpPanel}`} hidden={openPanel !== "help"} aria-label="ヒートマップの使い方" onKeyDown={(event) => { if (event.key === "Escape") closePanel(); }}>
        <div className={styles.panelHeader}><h2>使い方・集計の説明</h2><button type="button" onClick={closePanel} aria-label="使い方を閉じる">×</button></div>
        <p>地図をスクロールして移動し、台番号を選ぶと詳細を開きます。拡大・縮小や「全体」で表示範囲を調整できます。</p>
        <p>設定狙いと同じ推定差枚です。100G以上・最終AT終了時に即やめする想定のデータで平均します。紫の斜線は履歴あり・差枚未集計、灰色は{hallId === "shinjuku" ? "この条件の履歴なし" : "この条件の差枚集計なし（履歴の有無は未確認）"}です。未集計の履歴は差枚の平均に含めません。</p>
        {data?.snapshotFallbackTo && <p>特定日は一部の台で{data.snapshotFallbackTo.replaceAll("-", "/")}までの集計済みデータを表示しています。</p>}
        <p>特定日は日付の数字で抽出（例：1のつく日＝1・10〜19・21・31日）。</p>
        <p>{/^\d{4}-\d{2}-\d{2}$/.test(floor.asOf) ? `${floor.asOf.replaceAll("-", "/")}時点の配置。` : `${floor.asOf}。`}入替前後も同じ台番号で集計。</p>
        {floor.layoutNote && <p>{floor.layoutNote}</p>}
        <p><a href={floor.sourceUrl} target="_blank" rel="noreferrer">配置図の出典</a></p>
      </section>

      <section id="heatmap-unplaced" className={styles.infoPanel} hidden={openPanel !== "unplaced"} aria-label="配置未確認の台" onKeyDown={(event) => { if (event.key === "Escape") closePanel(); }}>
        <div className={styles.panelHeader}><h2>配置未確認の台 · {unplacedUnits.length.toLocaleString("ja-JP")}台</h2><button type="button" onClick={closePanel} aria-label="配置未確認の一覧を閉じる">×</button></div>
        <p className={styles.unplacedNote}>データはありますが、配置図で位置を確認できない台です。場所は推定せず、この一覧に表示します。台番号を選ぶと詳細を開きます。</p>
        <ul className={styles.unplacedList}>
          {unplacedUnits.map((unit) => {
            const observed = units.get(unit);
            const pending = !observed ? pendingUnits.get(unit) : undefined;
            return <li key={unit}><button type="button" onClick={() => { selectUnit(unit); detailsButton.current?.focus({ preventScroll: true }); }} aria-label={`${unit}番台、配置未確認、${observed ? `平均差枚（推定）${formatNet(averageNet(observed))}、対象${observed.days}日` : `履歴あり・差枚未集計、${pending?.days === null ? "履歴日数は重複期間あり" : `履歴${pending?.days}日`}`}`}>
              <strong>{unit}<span>番台</span></strong>
              <span>{observed ? formatNet(averageNet(observed)) : "履歴あり・差枚未集計"}</span>
              <small>{observed ? `対象${observed.days}日` : pending?.days === null ? "日数は重複期間あり" : `履歴${pending?.days}日`}</small>
            </button></li>;
          })}
        </ul>
      </section>

      {!data && <p className={styles.notice} role="status">ヒートマップの集計データを準備中です。</p>}
      {data && shownUnits.length === 0 && pendingCount === 0 && <p className={styles.notice} role="status">{unplacedUnits.length > 0 ? "配置図内の対象データはありません。配置未確認の一覧をご覧ください。" : "この日付条件のデータはまだありません。"}</p>}

      <main className={styles.mapViewport} ref={viewport} tabIndex={0} aria-label={`${hall.title}の島図。上下左右にスクロールできます`}>
        <div className={styles.mapPadding}>
          <div className={styles.board} style={{ width: boardWidth, height: floor.height * scale }}>
            {floor.labels?.map((label) => <span key={`${label.text}-${label.x}-${label.y}`} className={styles.floorLabel} data-label={label.text} style={{ left: label.x * scale, top: label.y * scale, fontSize: Math.max(12, 20 * scale) }}>{label.text}</span>)}
            {floor.seats.map((seat) => {
              const unit = units.get(seat.unit);
              const pending = !unit ? pendingUnits.get(seat.unit) : undefined;
              const value = averageNet(unit);
              const color = pending ? { ...PENDING_HEAT_COLOR, empty: false } : heatColor(value);
              const details = pending
                ? `${seat.unit}番台、履歴あり・差枚未集計、${pending.days === null ? "重複期間あり" : `履歴${pending.days}日`}、${dateRange(pending.firstDate, pending.lastDate)}、${pending.reasons.join(" / ")}`
                : `${seat.unit}番台、平均差枚（推定）${formatNet(value)}${unit ? `、対象${unit.days}日` : ""}`;
              return (
                <button
                  key={seat.unit}
                  type="button"
                  className={`${styles.seat} ${color.empty ? styles.emptySeat : ""} ${selected === seat.unit ? styles.selectedSeat : ""}`}
                  style={{ left: seat.x * scale, top: seat.y * scale, width: seat.width * scale, height: seat.height * scale, background: color.background, color: color.foreground, fontSize: Math.min(seat.width / (seat.unit.length * 0.62), seat.height * 0.6) * scale * 0.88 }}
                  aria-label={details}
                  aria-pressed={selected === seat.unit}
                  title={details}
                  onClick={() => selectUnit(seat.unit)}
                >{seat.unit}</button>
              );
            })}
          </div>
        </div>
      </main>

    </div>
  );
}
