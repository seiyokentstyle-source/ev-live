"use client";

import { useState } from 'react';
import type { DisplayTarget } from '@/lib/saved-targets.mjs';
import { EmptyState, RowHead, TableScroll, Td, Th, stripe } from '@/components/ui/DataTable';
import { formatSigned, toneClass } from './format';

export function SavedTargets({ targets, selectedId, onSelect }: { targets: DisplayTarget[]; selectedId: string; onSelect: (id: string) => void }) {
  const [step, setStep] = useState(100);
  const target = targets.find(item => item.id === selectedId) ?? targets[0];
  if (!target) return <section className="flex min-h-0 flex-1 flex-col"><h2 className="border-b border-line px-4 py-3 text-sm font-bold">狙い目</h2><EmptyState>この機種・店舗に掲載中の狙い目はありません。</EmptyState></section>;
  const rows = target.rows.filter((row, index) => row.g === target.definition.startG || row.g % step === 0 || index === target.rows.length - 1);
  return <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="saved-target-heading">
    <div className="shrink-0 border-b border-line px-3 py-2">
      <div className="flex items-center justify-between gap-3"><h2 id="saved-target-heading" className="text-sm font-bold">狙い目</h2><span className="mono text-[10px] text-muted">46枚貸し／52枚交換</span></div>
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
        <details className="text-[11px] text-muted"><summary className="cursor-pointer">集計の見方</summary><p className="mt-1">開始Gごとに、その時点の条件を判定した推定平均収支です。同じATまでに複数区間が含まれることがあります。収集終了で対象当選に届かなかった区間は含みません。件数が少ない行は参考値です。</p></details>
        <label className="flex items-center gap-2 text-[11px] text-muted" htmlFor="saved-target-step">表示間隔<select id="saved-target-step" value={step} onChange={event => setStep(Number(event.target.value))} className="rounded border border-line bg-bg px-2 py-1 text-ink-soft"><option value={100}>100Gごと</option><option value={50}>50Gごと</option><option value={10}>10Gごと</option></select></label>
      </div>
      {rows.length ? <table className="mono w-full border-collapse text-xs"><thead><tr><Th corner>開始G</Th><Th primary unit="円">推定平均収支</Th><Th unit="区間">件数</Th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.g} className={row.g === target.definition.startG ? 'bg-accent-soft' : ''}><RowHead>{row.g}G{row.g === target.definition.startG ? <span className="ml-1 text-[9px] text-accent">指定</span> : null}</RowHead><Td bold tone={row.ev === null ? 'text-muted' : toneClass(row.ev)} alt={stripe(index)}>{row.ev === null ? '—' : formatSigned(row.ev)}</Td><Td alt={stripe(index)}>{row.n.toLocaleString('ja-JP')}</Td></tr>)}</tbody></table> : <p className="px-4 py-8 text-center text-xs text-muted">この条件で集計できる区間はありません。</p>}
    </TableScroll>
  </section>;
}
