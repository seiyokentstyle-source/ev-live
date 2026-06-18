import { notFound } from "next/navigation";
import type { Machine, SettingAim } from "@/lib/ev/types";
import { getMachine } from "@/lib/machines";
import { MachineDetailClient } from "@/app/machines/[id]/MachineDetailClient";

// スクレイパーを動かさずに「設定狙い」モードのUIを確認するためのプレビュー。
// 実データ(data/machines)は一切編集せず、表示時に実機のJSONへサンプルの
// settingAim を載せるだけ。CLAUDE.md の「表示の都合はサイト側で吸収する」に沿う。
export const dynamic = "force-static";

const SAMPLE_AIM: SettingAim = {
  label: "設定狙い（台番号別 推定出率）",
  unit: "%",
  note: "【サンプル表示】出率＝OUT÷IN（3枚掛け・即やめ想定／直近21日）。AT中Gは純増ペースで推定（機種スペック依存）。100%超が続く台＝高設定候補。※数値は表示確認用のダミーです。",
  dates: ["2026-06-12", "2026-06-13", "2026-06-14", "2026-06-15", "2026-06-16"],
  units: [
    { unit: "1024", avg: 110.6, days: 5, rates: [112.4, 108.1, 114.3, 107.0, 111.2], net: 6240 },
    { unit: "1009", avg: 108.4, days: 5, rates: [110.2, 105.8, 112.1, 104.9, 109.0], net: 4820 },
    { unit: "1037", avg: 106.9, days: 4, rates: [108.5, null, 105.1, 109.2, 104.8], net: 3910 },
    { unit: "1018", avg: 105.2, days: 5, rates: [103.5, 108.2, 101.8, 106.4, 106.1], net: 2980 },
    { unit: "1002", avg: 103.7, days: 5, rates: [101.9, 105.0, 104.6, 102.3, 104.7], net: 2110 },
    { unit: "1031", avg: 102.4, days: 4, rates: [103.0, null, 100.4, 102.8, 103.4], net: 1340 },
    { unit: "1045", avg: 101.5, days: 3, rates: [102.8, 99.6, null, 102.1, null], net: 890 },
    { unit: "1013", avg: 100.8, days: 5, rates: [99.4, 102.1, 100.0, 101.3, 101.2], net: 520 },
    { unit: "1026", avg: 100.1, days: 5, rates: [98.7, 101.5, 99.2, 100.8, 100.3], net: 60 },
    { unit: "1007", avg: 99.2, days: 5, rates: [97.6, 101.1, 98.4, 100.2, 98.7], net: -360 },
    { unit: "1052", avg: 98.4, days: 4, rates: [96.9, 99.8, null, 98.5, 98.4], net: -780 },
    { unit: "1020", avg: 97.6, days: 5, rates: [99.1, 96.2, 98.0, 96.8, 97.9], net: -1190 },
    { unit: "1041", avg: 96.3, days: 3, rates: [95.1, 94.8, null, 99.0, null], net: -1280 },
    { unit: "1033", avg: 95.0, days: 5, rates: [93.6, 96.1, 94.2, 96.7, 94.4], net: -2350 },
    { unit: "1015", avg: 92.8, days: 5, rates: [90.4, 93.1, 91.7, 95.2, 93.6], net: -3110 },
    { unit: "1048", avg: 90.5, days: 4, rates: [88.2, 91.6, null, 92.0, 90.2], net: -4020 },
    { unit: "1004", avg: 88.1, days: 5, rates: [85.9, 89.3, 87.4, 90.1, 87.8], net: -5180 },
    { unit: "1029", avg: 85.7, days: 3, rates: [84.0, null, 86.2, null, 86.9], net: -3640 }
  ]
};

export default async function SettingAimPreviewPage() {
  const base = await getMachine("vvv2");
  if (!base) notFound();
  const machine: Machine = { ...base, settingAim: SAMPLE_AIM };
  return <MachineDetailClient machine={machine} />;
}
