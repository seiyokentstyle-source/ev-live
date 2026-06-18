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
    { unit: "1024", avg: 108.4, days: 5, rates: [110.2, 105.8, 112.1, 104.9, 109.0], net: 4820 },
    { unit: "1018", avg: 103.1, days: 5, rates: [101.5, 106.2, 99.8, 104.4, 103.6], net: 1530 },
    { unit: "1031", avg: 101.7, days: 4, rates: [103.0, null, 100.4, 102.8, 100.6], net: 940 },
    { unit: "1007", avg: 99.2, days: 5, rates: [97.6, 101.1, 98.4, 100.2, 98.7], net: -360 },
    { unit: "1042", avg: 96.3, days: 3, rates: [95.1, 94.8, null, 99.0, null], net: -1280 },
    { unit: "1015", avg: 92.8, days: 5, rates: [90.4, 93.1, 91.7, 95.2, 93.6], net: -3110 }
  ]
};

export default async function SettingAimPreviewPage() {
  const base = await getMachine("vvv2");
  if (!base) notFound();
  const machine: Machine = { ...base, settingAim: SAMPLE_AIM };
  return <MachineDetailClient machine={machine} />;
}
