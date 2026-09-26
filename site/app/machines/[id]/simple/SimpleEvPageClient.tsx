"use client";

import Link from "next/link";
import type { SimpleEvSet } from "@/lib/ev/simple-ev-tables";
import { SimpleEvTable } from "@/components/ev/SimpleEvTable";

type SimpleEvPageClientProps = {
  machineId: string;
  machineName: string;
  set: SimpleEvSet;
};

export function SimpleEvPageClient({ machineId, machineName, set }: SimpleEvPageClientProps) {
  return (
    <div className="app-shell">
      <header className="grid h-12 shrink-0 grid-cols-[4rem_1fr_4rem] items-center border-b border-line bg-panel px-4">
        <Link href={`/machines/${machineId}`} className="mono text-[11px] text-ink-soft">
          ← 店舗
        </Link>
        <h1 className="truncate px-2 text-center text-sm font-bold">{machineName}</h1>
        <span className="mono truncate text-right text-[10px] text-muted">簡易期待値表</span>
      </header>
      <SimpleEvTable set={set} />
    </div>
  );
}
