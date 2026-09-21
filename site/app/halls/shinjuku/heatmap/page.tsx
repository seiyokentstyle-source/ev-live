import type { Metadata } from "next";
import { getShinjukuHeatmapData } from "@/lib/heatmap/data";
import { SHINJUKU_FLOOR } from "@/lib/heatmap/shinjuku-layout";
import { HeatmapClient } from "./HeatmapClient";

export const metadata: Metadata = {
  title: "新宿 台番号ヒートマップ | EV Live",
  description: "新宿の台番号ごとの平均差枚（推定）。日付不問・特定日で島図を確認できます。"
};

export default async function ShinjukuHeatmapPage() {
  return <HeatmapClient data={await getShinjukuHeatmapData()} floor={SHINJUKU_FLOOR} />;
}
