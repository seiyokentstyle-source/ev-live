import { parseUnitLabel } from "@/lib/ev/unit-label";

/** 台番号セルの中身。店舗混合では小さな店舗札の下に番号を太字で出す。 */
export function UnitName({ unit }: { unit: string }) {
  const { hall, number } = parseUnitLabel(unit);
  if (hall === null) return <>{number}</>;
  return (
    <span className="inline-flex flex-col items-start leading-tight" title={unit}>
      <span className="rounded border border-line-soft bg-panel-2 px-1 text-[9px] font-medium text-muted">{hall}</span>
      <span className="font-bold tabular-nums">{number}</span>
    </span>
  );
}
