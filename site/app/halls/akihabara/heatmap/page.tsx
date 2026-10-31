import type { Metadata } from "next";
import { getHeatmapData } from "@/lib/heatmap/data";
import { AKIHABARA_FLOOR } from "@/lib/heatmap/akihabara-layout";
import { HeatmapClient } from "../../shinjuku/heatmap/HeatmapClient";

export const metadata: Metadata = {
  title: "アイランド秋葉原 台番号ヒートマップ | EVOT",
  description: "アイランド秋葉原の台番号ごとの平均差枚（推定）。保存済みの設定狙いデータを配置図で確認できます。",
};

export default async function AkihabaraHeatmapPage() {
  return <HeatmapClient hallId="akihabara" data={await getHeatmapData("akihabara")} floor={AKIHABARA_FLOOR} />;
}
