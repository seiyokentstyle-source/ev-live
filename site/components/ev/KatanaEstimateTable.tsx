"use client";

import type { KatanaEstimate } from "@/lib/ev/katana-estimate";
import { ControlBar, SegmentedControl } from "@/components/ui/Controls";
import { EmptyState, RowHead, TableFoot, TableNote, TableScroll, Td, Th, stripe } from "@/components/ui/DataTable";

type KatanaRow = Extract<KatanaEstimate, { ready: true }>["rows"][number];
const COLORS = [
  { key: "blue", label: "青", tone: "text-sky-300" },
  { key: "yellow", label: "黄", tone: "text-amber-300" },
  { key: "red", label: "赤", tone: "text-rose-300" },
] as const;

function number(value: number, digits = 0): string {
  return value.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function ResultCell({ row, alt }: { row: KatanaRow | undefined; alt: string }) {
  if (!row) return <Td alt={alt}>—</Td>;
  return (
    <Td alt={alt}>
      <span className={`block font-bold ${row.evYen < 0 ? "text-neg" : "text-pos"}`}>{number(row.evYen)}円</span>
      <span className="block text-[10px]">{number(row.rtpPct, 1)}%</span>
      <span className="block text-[9px] text-muted">時給 {number(row.hourlyYen)}円</span>
    </Td>
  );
}

/** 公開済みの54条件を選択・表示する。金額の計算は生成側だけで行う。 */
export function KatanaEstimateTable({ data, highState, onHighStateChange }: {
  data: KatanaEstimate;
  highState: boolean;
  onHighStateChange: (value: boolean) => void;
}) {
  const rows = data.ready ? data.rows.filter(row => row.highState === highState) : [];
  const points = [...new Set(rows.map(row => row.displayPt))].sort((a, b) => a - b);
  const byPointAndColor = new Map(rows.map(row => [`${row.displayPt}:${row.color}`, row]));
  const inverse = data.calibration.inverseEconomics;
  const modelNote = [
    "回収相当率pと非AT時間は設定1・等価の外部表からの条件付き逆算値です。",
    `校正元：${data.calibration.source.articleVersion}。${data.calibration.source.conditions}`,
    `逆算時の尺度：獲得${number(inverse.conditionalAtRewardScale, 2)}枚、費用${number(inverse.costPerGame, 4)}枚/G、純増${number(inverse.netPayoutPerAtGame, 1)}枚/G。`,
    `現在のEVOT費用${number(data.economics.costPerGame, 2)}枚/G・純増${number(data.economics.netPayoutPerAtGame, 1)}枚/Gで計算。回収相当率pは実測AT当選率ではありません。`,
    ...data.notes,
    data.quality.note,
  ].join(" ");

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="shrink-0 border-b border-line px-3 py-2 text-[11px] leading-relaxed">
        <p className="font-bold text-ink-soft">設定未調整の参考試算 · 20円等価 · AT終了即やめ</p>
        <p className="mono mt-1 text-ink-soft">
          平均獲得 <strong>{data.ready ? `${number(data.sample.meanPayout, 1)}枚` : "—"}</strong>
          <span className="ml-3 text-muted">n={number(data.sample.count)}件</span>
        </p>
        <p className="mono text-[10px] text-muted">{data.source.periodStart}〜{data.source.periodEnd} · 当選Gの下2桁50〜99</p>
      </div>
      <TableNote>{modelNote}</TableNote>
      {!data.ready ? (
        <EmptyState title="対象サンプルなし">当選Gの下2桁50〜99に該当する通常ATが0件のため、参考試算を表示できません。</EmptyState>
      ) : <>
        <ControlBar label="斬高確">
          <SegmentedControl
            segments={[{ value: "off", label: "なし" }, { value: "on", label: "あり" }]}
            value={highState ? "on" : "off"}
            onChange={value => onHighStateChange(value === "on")}
          />
        </ControlBar>
        <TableScroll>
          <table className="mono w-full table-fixed border-separate border-spacing-0 text-xs">
            <caption className="sr-only">刀ポイント参考試算・斬高確{highState ? "あり" : "なし"}・20円等価</caption>
            <thead><tr>
              <Th corner unit="見た目pt">刀ポイント</Th>
              {COLORS.map(color => <Th key={color.key} unit="期待値 / 出率 / 時給"><span className={color.tone}>{color.label}</span></Th>)}
            </tr></thead>
            <tbody>{points.map((point, index) => <tr key={point}>
              <RowHead>{point}pt</RowHead>
              {COLORS.map(color => <ResultCell key={color.key} row={byPointAndColor.get(`${point}:${color.key}`)} alt={stripe(index)} />)}
            </tr>)}</tbody>
          </table>
        </TableScroll>
      </>}
      <TableFoot left={`対象 ${number(data.sample.count)}件`} right={
        <a href={data.calibration.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">校正元の条件</a>
      } />
    </div>
  );
}
