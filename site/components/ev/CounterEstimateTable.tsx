"use client";

import { useState } from "react";
import type { CounterEstimate } from "@/lib/ev/types";
import { RateSelector } from "./RateSelector";
import { formatSigned } from "./format";
import { RowHead, TableScroll, Td, Th, stripe } from "@/components/ui/DataTable";
import { ControlBar, SegmentedControl } from "@/components/ui/Controls";

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

/** 店舗のカウンター履歴から計算した推定表。実測EV（保留中）とは別に、推定であることを明示して出す。 */
export function CounterEstimateTable({ data }: { data: CounterEstimate }) {
  const [groupKey, setGroupKey] = useState<string>(data.groups[0].key);
  const [rateKey, setRateKey] = useState("46/52");
  const group = data.groups.find(item => item.key === groupKey) ?? data.groups[0];
  const rate = group.rates.find(item => item.key === rateKey) ?? group.rates[0];
  const s = data.summary;
  return (
    <section aria-label={data.label} className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="max-h-[50vh] shrink-0 overflow-y-auto border-y border-highlight/40 bg-panel px-4 py-3">
        <h2 className="text-xs font-bold text-highlight">{data.label}</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{data.note}</p>
        <p className="mt-1 text-[11px] font-bold text-ink-soft">
          G軸はこの店舗の外部カウンターから推定した通常時G（AT終了後の既定Gを差し引いた値）です。液晶Gとは一致しないことがあります。
        </p>
        <p className="mono mt-1 text-[11px] text-ink-soft">
          {s.firstDate}〜{s.lastDate}・{s.unitDays.toLocaleString("ja-JP")}台日 · AT初当り 1/{s.firstHitGames} · 推定平均獲得 {s.meanPayout.toLocaleString("ja-JP")}枚
        </p>
        <details className="mono mt-2 text-[10px] leading-relaxed text-ink-soft">
          <summary className="cursor-pointer">計算の仮定・推定値を確認</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {data.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}
          </ul>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt>仮定した平均設定</dt><dd>{s.assumedAverageSetting}（公表出玉率 {s.assumedRtp}%）</dd>
            <dt>推定ボーナス単価</dt><dd>通常 {s.normalBonus}枚・上位 {s.upperBonus}枚（実測値ではありません）</dd>
            <dt>ATの内訳</dt><dd>駆け抜け {percent(s.kakeShare)}・通常 {percent(s.normalShare)}・上位 {percent(s.upperShare)}</dd>
            {s.excludedDates.length ? <><dt>除外した日</dt><dd>{s.excludedDates.join("・")}（全台の履歴が別の日と同一）</dd></> : null}
          </dl>
          <p className="mt-2">収支換算率＝100＋丸め前の推定EV円÷（20円×3枚×平均消化G）×100。46/52は交換差を含み、公表機械割とは異なる換算値です。</p>
        </details>
      </div>
      <ControlBar label="前回AT" collapsible>
        <SegmentedControl segments={data.groups.map(item => ({ value: item.key, label: item.label }))} value={group.key} onChange={setGroupKey} />
      </ControlBar>
      <RateSelector rates={group.rates.map(item => ({ value: item.key, label: item.label }))} value={rate.key} onChange={setRateKey} />
      <TableScroll>
        {rate.anchors.length ? <table className="mono w-full table-fixed border-separate border-spacing-0 text-xs">
          <caption className="sr-only">{data.label} · {group.label} · {rate.label}</caption>
          <thead><tr>
            <Th>打ち始め</Th><Th unit="件">件数</Th><Th unit="円">推定EV</Th><Th unit="%">収支換算率</Th><Th unit="枚">平均投入</Th><Th unit="G">平均消化</Th>
          </tr></thead>
          <tbody>{rate.anchors.map((anchor, index) => {
            const alt = stripe(index);
            return <tr key={anchor.g}>
              <RowHead>{anchor.g.toLocaleString("ja-JP")}</RowHead>
              <Td alt={alt}>{anchor.n.toLocaleString("ja-JP")}</Td>
              <Td alt={alt}>{formatSigned(anchor.ev)}</Td>
              <Td alt={alt}>{anchor.rtp.toFixed(1)}</Td>
              <Td alt={alt}>{anchor.inv.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}</Td>
              <Td alt={alt}>{anchor.playG.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}</Td>
            </tr>;
          })}</tbody>
        </table> : <p className="px-4 py-6 text-center text-[11px] text-muted">この条件は件数が足りないため表示できません。</p>}
      </TableScroll>
    </section>
  );
}
