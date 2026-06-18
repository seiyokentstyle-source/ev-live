import { notFound } from "next/navigation";
import type { Machine, SettingAim } from "@/lib/ev/types";
import { getMachine } from "@/lib/machines";
import { MachineDetailClient } from "@/app/machines/[id]/MachineDetailClient";

// スクレイパーを動かさずに「設定狙い」モードのUIを確認するためのプレビュー。
// 実データ(data/machines)は一切編集せず、表示時に実機のJSONへ settingAim を載せるだけ。
// CLAUDE.md の「表示の都合はサイト側で吸収する」に沿う。
//
// 出率は実機の履歴（Lヴヴヴ2・47台・2026-06-09〜06-10）から daily_rate と同じ式で算出:
//   通常時G=Σ当選G / AT中G=Σ獲得÷純増ペース(9.0) / 総G=通常時G+AT中G
//   差枚=Σ獲得−使用枚数(1.53)×通常時G（履歴推定・差枚校正なし） / IN=3×総G / 出率=(IN+差枚)÷IN
export const dynamic = "force-static";

const SETTING_AIM: SettingAim = {
  label: "設定狙い（台番号別 推定出率）",
  unit: "%",
  note: "出率＝OUT÷IN（3枚掛け・即やめ想定）。AT中Gは純増ペースで推定（機種スペック依存）。100%超が続く台＝高設定候補。実機履歴（Lヴヴヴ2・2026-06-09〜06-10）からの推定値（差枚校正なし）。",
  dates: ["2026-06-09", "2026-06-10"],
  units: [
    { unit: "968", avg: 180.1, days: 2, rates: [280.1, 80.1], net: -1884 },
    { unit: "992", avg: 132.8, days: 2, rates: [151.2, 114.5], net: 7096 },
    { unit: "987", avg: 120.6, days: 2, rates: [123.0, 118.2], net: 5251 },
    { unit: "975", avg: 117.9, days: 2, rates: [106.0, 129.8], net: 7146 },
    { unit: "793", avg: 115.1, days: 2, rates: [115.8, 114.4], net: 3675 },
    { unit: "976", avg: 110.8, days: 2, rates: [143.1, 78.5], net: 3390 },
    { unit: "800", avg: 109.3, days: 2, rates: [110.1, 108.6], net: 3731 },
    { unit: "806", avg: 108.1, days: 2, rates: [121.2, 95.0], net: 1028 },
    { unit: "967", avg: 107.5, days: 2, rates: [89.4, 125.6], net: 221 },
    { unit: "978", avg: 105.8, days: 2, rates: [103.2, 108.5], net: 2149 },
    { unit: "798", avg: 103.6, days: 2, rates: [97.0, 110.2], net: 442 },
    { unit: "989", avg: 103.2, days: 2, rates: [109.0, 97.5], net: 934 },
    { unit: "973", avg: 102.0, days: 2, rates: [129.7, 74.4], net: 5839 },
    { unit: "980", avg: 102.0, days: 2, rates: [85.1, 119.0], net: 3725 },
    { unit: "792", avg: 99.4, days: 2, rates: [104.3, 94.6], net: 580 },
    { unit: "972", avg: 99.2, days: 2, rates: [79.9, 118.5], net: 654 },
    { unit: "969", avg: 97.3, days: 2, rates: [83.2, 111.5], net: -2308 },
    { unit: "801", avg: 97.1, days: 2, rates: [98.2, 95.9], net: -510 },
    { unit: "796", avg: 96.8, days: 2, rates: [87.7, 105.9], net: -1901 },
    { unit: "1205", avg: 96.5, days: 2, rates: [98.1, 95.0], net: -790 },
    { unit: "984", avg: 96.4, days: 2, rates: [109.1, 83.7], net: -676 },
    { unit: "1216", avg: 94.8, days: 2, rates: [97.0, 92.7], net: -2358 },
    { unit: "790", avg: 94.3, days: 2, rates: [102.1, 86.5], net: -1560 },
    { unit: "1215", avg: 93.8, days: 2, rates: [85.9, 101.8], net: -1222 },
    { unit: "791", avg: 93.2, days: 2, rates: [80.3, 106.2], net: -484 },
    { unit: "979", avg: 92.4, days: 2, rates: [95.3, 89.6], net: -1644 },
    { unit: "990", avg: 90.8, days: 2, rates: [116.5, 65.2], net: -221 },
    { unit: "794", avg: 90.3, days: 2, rates: [121.1, 59.6], net: 2081 },
    { unit: "985", avg: 90.2, days: 2, rates: [102.7, 77.7], net: -751 },
    { unit: "991", avg: 89.5, days: 2, rates: [76.7, 102.3], net: -1464 },
    { unit: "974", avg: 88.9, days: 2, rates: [81.0, 96.8], net: -1362 },
    { unit: "981", avg: 88.7, days: 2, rates: [90.2, 87.1], net: -3790 },
    { unit: "970", avg: 88.3, days: 2, rates: [81.3, 95.3], net: -3423 },
    { unit: "797", avg: 87.0, days: 2, rates: [76.4, 97.6], net: -2029 },
    { unit: "971", avg: 86.6, days: 2, rates: [84.2, 89.0], net: -4367 },
    { unit: "805", avg: 85.2, days: 2, rates: [82.5, 88.0], net: -5391 },
    { unit: "988", avg: 83.8, days: 2, rates: [88.4, 79.1], net: -2454 },
    { unit: "803", avg: 83.4, days: 2, rates: [76.9, 89.9], net: -3217 },
    { unit: "802", avg: 82.7, days: 2, rates: [74.8, 90.6], net: -1563 },
    { unit: "799", avg: 81.3, days: 2, rates: [99.1, 63.6], net: -2530 },
    { unit: "986", avg: 81.1, days: 2, rates: [96.5, 65.7], net: -2670 },
    { unit: "977", avg: 80.8, days: 2, rates: [81.6, 80.0], net: -5276 },
    { unit: "804", avg: 78.2, days: 2, rates: [77.6, 78.7], net: -1079 },
    { unit: "982", avg: 75.2, days: 2, rates: [58.4, 92.1], net: -2824 },
    { unit: "983", avg: 73.6, days: 2, rates: [69.9, 77.2], net: -2587 },
    { unit: "1211", avg: 68.8, days: 2, rates: [70.7, 66.8], net: -9857 },
    { unit: "795", avg: 68.5, days: 2, rates: [65.9, 71.1], net: -3683 }
  ]
};

// 期待値稼働モードの「件数」列も確認できるよう、各アンカーにサンプルの n を載せる。
// 実データの n は未生成で全行「—」なので、低Gほど多く天井へ向けて減る生存曲線で擬似値を振る。
const TOTAL_SAMPLES = 743;
function sampleN(g: number): number {
  return Math.max(3, Math.round(TOTAL_SAMPLES * Math.exp(-g / 330)));
}

export default async function SettingAimPreviewPage() {
  const base = await getMachine("vvv2");
  if (!base) notFound();
  const profiles = base.profiles.map((profile) => ({
    ...profile,
    baseAnchors: profile.baseAnchors.map((anchor) => ({ ...anchor, n: sampleN(anchor.g) }))
  }));
  const machine: Machine = { ...base, profiles, settingAim: SETTING_AIM };
  return <MachineDetailClient machine={machine} />;
}
