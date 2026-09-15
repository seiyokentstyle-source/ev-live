"use client";

import { useState } from 'react';
import type { DisplayTarget } from '@/lib/saved-targets.mjs';
import type { Machine } from '@/lib/ev/types';
import { cashRtp, rtpExplanation } from '@/lib/ev/rtp';
import { EmptyState, TableFoot, TableScroll } from '@/components/ui/DataTable';
import { EvTableGrid, type EvTableRow } from './EvTable';

export function savedTargetTableRows(target: DisplayTarget, machine: Machine, step: number): EvTableRow[] {
  return target.rows
    .filter((row, index) => row.g === target.definition.startG || row.g % step === 0 || index === target.rows.length - 1)
    .map(row => {
      const games = row.playG;
      const hasDuration = games !== undefined && games !== null && games > 0;
      return {
        g: row.g, ev: row.ev, n: row.n,
        rtp: row.ev !== null && hasDuration ? cashRtp(row.ev, games, machine.evCalc?.bet || 3) : null,
        hourly: row.ev !== null && hasDuration ? Math.round(row.ev * machine.economics.gamesPerHour / games) : null,
        medals: row.inv === undefined || row.inv === null ? null : Math.round(row.inv),
        noData: row.ev === null,
        zoneLabel: row.g === target.definition.startG ? '指定' : undefined,
      };
    });
}

export function SavedTargets({ machine, targets, selectedId, onSelect }: { machine: Machine; targets: DisplayTarget[]; selectedId: string; onSelect: (id: string) => void }) {
  const [step, setStep] = useState(10);
  const target = targets.find(item => item.id === selectedId) ?? targets[0];
  if (!target) return <section className="flex min-h-0 flex-1 flex-col"><h2 className="border-b border-line px-4 py-3 text-sm font-bold">狙い目</h2><EmptyState>この機種・店舗に掲載中の狙い目はありません。</EmptyState></section>;
  const rows = savedTargetTableRows(target, machine, step);
  return <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="saved-target-heading">
    <div className="shrink-0 border-b border-line px-3 py-2">
      <div className="flex items-center justify-between gap-3"><h2 id="saved-target-heading" className="text-sm font-bold">狙い目</h2><span className="mono text-[10px] text-muted">{target.rate === '50/50' ? '50枚貸し／50枚交換' : '46枚貸し／52枚交換'}</span></div>
      <label htmlFor="saved-target-choice" className="sr-only">狙い目を選ぶ</label>
      <select id="saved-target-choice" value={target.id} onChange={event => onSelect(event.target.value)} className="mt-2 w-full rounded-md border border-line bg-bg px-2 py-2 text-xs text-ink">
        {targets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </div>
    <TableScroll>
      <div className="space-y-2 border-b border-line px-3 py-3 text-xs leading-relaxed">
        <h3 className="break-words font-bold text-highlight">{target.name}</h3>
        <p className="text-ink-soft">{target.profile} · {target.definition.startG}G開始</p>
        <p className="break-words text-ink-soft">{target.conditions || '追加条件なし'}</p>
        <p className="text-ink-soft">{target.definition.endG === null ? '対象当選まで続行' : `未当選なら${target.definition.endG}Gまで`}。{target.stopping}</p>
        <p className="mono text-[10px] text-muted">{target.dataThrough}分まで · {target.refreshed ? '収集後の再集計' : '追加時の集計'}</p>
        {target.assumedPayout ? <p className="text-[11px] text-muted">出玉は実測できないため、EVLIVEと同じ設定1の想定値です。当たりやすさの比較用です。</p> : null}
        <details className="text-[11px] text-muted"><summary className="cursor-pointer">集計の見方</summary><p className="mt-1">開始Gごとに、その時点の条件を判定した推定平均収支です。同じATまでに複数区間が含まれることがあります。収集終了で対象当選に届かなかった区間は含みません。件数が少ない行は参考値です。</p><p className="mt-1">{rtpExplanation(machine.economics.gamesPerHour, machine.evCalc?.bet || 3)}。消化Gや投入枚数のない集計は、該当する指標を「—」で表示します。</p></details>
        <label className="flex items-center gap-2 text-[11px] text-muted" htmlFor="saved-target-step">表示間隔<select id="saved-target-step" value={step} onChange={event => setStep(Number(event.target.value))} className="rounded border border-line bg-bg px-2 py-1 text-ink-soft"><option value={10}>10Gごと</option><option value={50}>50Gごと</option><option value={100}>100Gごと</option></select></label>
      </div>
      {rows.length ? <EvTableGrid machine={machine} profile={{ key: `target_${target.rate === '46/52' ? '4652' : '5050'}` }} rows={rows} /> : <p className="px-4 py-8 text-center text-xs text-muted">この条件で集計できる区間はありません。</p>}
    </TableScroll>
    <TableFoot left={`${step}G刻み / ${rows.length.toLocaleString('ja-JP')}行`} right={rows.length ? `${rows[0].g.toLocaleString('ja-JP')}〜${rows[rows.length - 1].g.toLocaleString('ja-JP')}G` : '集計なし'} />
  </section>;
}
