import type { Metadata } from "next";
import { getHeatmapData } from "@/lib/heatmap/data";
import { KABUKI_FLOOR } from "@/lib/heatmap/kabuki-layout";
import { HeatmapClient } from "../../shinjuku/heatmap/HeatmapClient";

export const metadata: Metadata = {
  title: "エスパス歌舞伎町 台番号ヒートマップ | EVOT",
  description: "エスパス歌舞伎町の台番号ごとの平均差枚（推定）。保存済みの設定狙いデータをフロアごとに確認できます。",
};

export default async function KabukiHeatmapPage() {
  return <HeatmapClient hallId="kabuki" data={await getHeatmapData("kabuki")} floor={KABUKI_FLOOR} />;
}
