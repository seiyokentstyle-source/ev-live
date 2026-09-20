"use client";

import { useEffect, useState } from "react";
import type { DecodedFilterAggregation, FilterAggregation, FilterAxis } from "./types";
import { beginAggregationDecode } from "./aggregation-decode";

type Snapshot = { source: FilterAggregation; status: "ready"; data: DecodedFilterAggregation }
  | { source: FilterAggregation; status: "error" };

export function useFilterAggregation(source: FilterAggregation | undefined, axes: FilterAxis[], requested: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!requested || !source || source.rows !== undefined) { setSnapshot(null); return; }
    setSnapshot(null);
    return beginAggregationDecode(source, axes,
      data => setSnapshot({ source, status: "ready", data }),
      () => setSnapshot({ source, status: "error" }));
  }, [source, axes, requested, attempt]);
  const retry = () => { setSnapshot(null); setAttempt(value => value + 1); };
  if (!requested || !source) return { status: "idle" as const, data: undefined, retry };
  if (source.rows !== undefined) return { status: "ready" as const, data: source, retry };
  // A completed old profile must never fill a newly selected profile while its effect starts.
  if (!snapshot || snapshot.source !== source) return { status: "loading" as const, data: undefined, retry };
  return snapshot.status === "ready" ? { status: "ready" as const, data: snapshot.data, retry }
    : { status: "error" as const, data: undefined, retry };
}
