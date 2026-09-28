"use client";

import { useState } from "react";
import type { ProvisionalSetting1 } from "@/lib/ev/types";
import { RateSelector } from "./RateSelector";
import { formatSigned } from "./format";
import { RowHead, TableScroll, Td, Th, stripe } from "@/components/ui/DataTable";

/** Separate from empirical profiles: no sample column, border or recommended starting G. */
export function ProvisionalSetting1Table({ data }: { data: ProvisionalSetting1 }) {
  const [selected, setSelected] = useState("46/52");
  const rate = data.rates.find(item => item.key === selected) ?? data.rates[0];
  const inputs = data.publicInputs;
  return (
    <section aria-label={data.label} className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="max-h-[50vh] shrink-0 overflow-y-auto border-y border-highlight/40 bg-panel px-4 py-3">
        <h2 className="text-xs font-bold text-highlight">{data.label}</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{data.note}</p>
        <p className="mt-1 text-[11px] font-bold text-ink-soft">G軸はモデル上の通常時Gです。店舗の外部カウンター値とは対応未確認です。</p>
        <p className="mt-1 text-[11px] font-bold text-ink-soft">天井の「+α」等を省略しているため、天井直前の参考EVは特に上振れする可能性があります。狙い始めの推奨値ではありません。</p>
        <details className="mono mt-2 text-[10px] leading-relaxed text-ink-soft">
          <summary className="cursor-pointer">計算の仮定・公表入力・出典を確認</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {data.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}
          </ul>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt>公表初当り分母</dt><dd>1/{inputs.firstHitMeanGames.toLocaleString("ja-JP")}</dd>
            <dt>公表設定1機械割</dt><dd>{(inputs.setting1Rtp * 100).toFixed(1)}%</dd>
            <dt>通常時使用枚数</dt><dd>{inputs.medalsPerGame.toLocaleString("ja-JP", { maximumFractionDigits: 4 })}枚/G</dd>
            <dt>ボーナス純増</dt><dd>{inputs.bonusNetMedalsPerGame}枚/G</dd>
            <dt>公称天井</dt><dd>{inputs.nominalCeilingGames.toLocaleString("ja-JP")}G（+α等は未反映）</dd>
            <dt>逆算した仮定純獲得</dt><dd>{data.modelInputs.assumedFixedPayout.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}枚（実測値ではありません）</dd>
          </dl>
          <p className="mt-2">収支換算率＝100＋丸め前の参考EV円÷（20円×3枚×想定消化G）×100。46/52は交換差を含み、公表機械割とは異なる換算値です。</p>
          <ul className="mt-2 space-y-1">
            {data.sources.map((source, index) => <li key={index}><a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">{source.label}</a></li>)}
          </ul>
        </details>
      </div>
      <RateSelector rates={data.rates.map(item => ({ value: item.key, label: item.label }))} value={rate.key} onChange={setSelected} />
      <TableScroll>
        <table className="mono w-full table-fixed border-separate border-spacing-0 text-xs">
          <caption className="sr-only">{data.label} · {rate.label}</caption>
          <thead><tr>
            <Th>モデルG</Th><Th unit="円">参考EV</Th><Th unit="%">収支換算率</Th><Th unit="枚">平均投入</Th><Th unit="G">想定消化</Th>
          </tr></thead>
          <tbody>{rate.anchors.map((anchor, index) => {
            const alt = stripe(index);
            return <tr key={anchor.g}>
              <RowHead>{anchor.g.toLocaleString("ja-JP")}</RowHead>
              <Td alt={alt}>{formatSigned(anchor.ev)}</Td>
              <Td alt={alt}>{anchor.rtp.toFixed(1)}</Td>
              <Td alt={alt}>{anchor.inv.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}</Td>
              <Td alt={alt}>{anchor.playG.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}</Td>
            </tr>;
          })}</tbody>
        </table>
      </TableScroll>
    </section>
  );
}
