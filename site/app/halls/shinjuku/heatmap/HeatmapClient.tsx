"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { HEATMAP_GROUP_KEYS, type FloorLayout, type HeatmapData, type HeatmapGroupKey } from "@/lib/heatmap/types";
import { averageNet, formatNet, groupLabel, heatColor, heatmapGroupDateRange, initialMapScroll, PENDING_HEAT_COLOR, summarizeUnits } from "@/lib/heatmap/values";
import styles from "./heatmap.module.css";

const BASE_WIDTH = 2300;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;

function dateRange(first?: string | null, last?: string | null) {
  if (!first || !last) return "対象データなし";
  return first === last ? first.replaceAll("-", "/") : `${first.replaceAll("-", "/")} 〜 ${last.replaceAll("-", "/")}`;
}

export function HeatmapClient({ data, floor }: { data: HeatmapData | null; floor: FloorLayout }) {
  const [groupKey, setGroupKey] = useState<HeatmapGroupKey>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const group = data?.groups.find((candidate) => candidate.key === groupKey);
  const units = useMemo(() => new Map(group?.units.map((unit) => [unit.unit, unit]) ?? []), [group]);
  const pendingUnits = useMemo(() => new Map(group?.pendingUnits?.map((unit) => [unit.unit, unit]) ?? []), [group]);
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

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <Link href="/" className={styles.back}>← 機種一覧</Link>
          <h1>新宿 <span>台番号ヒートマップ</span></h1>
          <p>ゴジラのお店 · 平均差枚（推定）</p>
        </div>
        <span className={styles.brand}><span className="logo-gradient">EV</span> Live</span>
      </header>

      <section className={styles.controls} aria-label="表示条件">
        <label className={styles.filter} htmlFor="heatmap-date">日付
          <select id="heatmap-date" value={groupKey} onChange={(event) => setGroupKey(event.target.value as HeatmapGroupKey)}>
            {HEATMAP_GROUP_KEYS.map((key) => <option key={key} value={key}>{groupLabel(key)}</option>)}
          </select>
        </label>
        <div className={styles.period}>
          <p>{dateRange(range.firstDate, range.lastDate)}</p>
          <p>{`差枚あり ${shownUnits.length.toLocaleString("ja-JP")}台 · 未集計 ${pendingCount.toLocaleString("ja-JP")}台 · 履歴なし ${missingCount.toLocaleString("ja-JP")}台`}</p>
          <p>{`差枚集計 ${summary.days.toLocaleString("ja-JP")}台日 / 島図 ${floor.seats.length.toLocaleString("ja-JP")}台`}</p>
        </div>
      </section>

      <div className={styles.legend} aria-label="平均差枚の色凡例">
        <div className={styles.colorScale}>
          <div className={styles.colorBar} aria-hidden="true">{[-2000, -1000, -500, -1, 0, 1, 500, 1000, 2000].map((value) => <i key={value} style={{ background: heatColor(value).background }} />)}</div>
          <div className={styles.scaleLabels}><span>−2,000枚以下</span><span>0</span><span>＋2,000枚以上</span></div>
        </div>
        <div className={styles.legendStates}>
          <span className={styles.noDataKey}><i aria-hidden="true" style={{ background: PENDING_HEAT_COLOR.background }} />履歴あり・未集計</span>
          <span className={styles.noDataKey}><i aria-hidden="true" />履歴なし</span>
        </div>
      </div>

      <div className={styles.mapToolbar}>
        <p>スクロールで移動 · 台番号を選択で詳細</p>
        <div className={styles.zoomControls} aria-label="島図の拡大縮小">
          <button type="button" aria-label="島図を縮小" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(zoom - 0.25)}>−</button>
          <output aria-label="表示倍率">{Math.round(zoom * 100)}%</output>
          <button type="button" aria-label="島図を拡大" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom + 0.25)}>＋</button>
          <button type="button" className={styles.reset} onClick={showOverview}>全体</button>
          <button type="button" className={styles.reset} onClick={resetView}>戻す</button>
        </div>
      </div>

      {!data && <p className={styles.notice} role="status">ヒートマップの集計データを準備中です。</p>}
      {data && shownUnits.length === 0 && pendingCount === 0 && <p className={styles.notice} role="status">この日付条件のデータはまだありません。</p>}

      <main className={styles.mapViewport} ref={viewport} tabIndex={0} aria-label="新宿の島図。上下左右にスクロールできます">
        <div className={styles.mapPadding}>
          <div className={styles.board} style={{ width: boardWidth, height: floor.height * scale }}>
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
                  onClick={() => setSelected(seat.unit)}
                >{seat.unit}</button>
              );
            })}
          </div>
        </div>
      </main>

      <section className={styles.detail} aria-live="polite" aria-atomic="true" aria-label="選択した台の詳細">
        {selected ? <><strong className={styles.unitTitle}>{selected}<span>番台</span></strong>{pendingSelection
          ? <div className={styles.pendingDetail}>
            <strong>履歴あり・差枚未集計</strong>
            <p>{pendingSelection.reasons.join(" / ")}</p>
            <p>{pendingSelection.days === null ? "履歴日数：重複期間があるため合算していません" : `履歴日数：${pendingSelection.days}日`} · {dateRange(pendingSelection.firstDate, pendingSelection.lastDate)}</p>
            {pendingSelection.overlappingPeriods?.map((period, index) => <p key={index}>{dateRange(period.firstDate, period.lastDate)}：{period.days}日（{period.reason}）</p>)}
          </div>
          : <><div><span className={styles.detailLabel}>平均差枚（推定）</span><strong>{formatNet(averageNet(selection))}</strong></div><div><span className={styles.detailLabel}>対象日数</span><strong>{selection ? `${selection.days}日` : "—"}</strong></div></>}</> : <p>台番号を選ぶと、差枚や履歴の状況を表示します。</p>}
      </section>

      <footer className={styles.footer}>
        <p>設定狙いと同じ推定差枚です。100G以上・最終AT終了時に即やめする想定のデータで平均します。紫の斜線は履歴あり・差枚未集計、灰色はこの条件の履歴なしです。未集計の履歴は差枚の平均に含めません。</p>
        {data?.snapshotFallbackTo && <p>特定日は一部の台で{data.snapshotFallbackTo.replaceAll("-", "/")}までの集計済みデータを表示しています。</p>}
        <p>特定日は日付の数字で抽出（例：1のつく日＝1・10〜19・21・31日）。</p>
        <p>{floor.asOf.replaceAll("-", "/")}時点の配置。入替前後も同じ台番号で集計。</p>
      </footer>
    </div>
  );
}
