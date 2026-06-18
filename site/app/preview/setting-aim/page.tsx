import { notFound } from "next/navigation";
import type { Machine, SettingAim } from "@/lib/ev/types";
import { getMachine } from "@/lib/machines";
import { MachineDetailClient } from "@/app/machines/[id]/MachineDetailClient";

// スクレイパーを動かさずに「設定狙い」モードのUIを確認するためのプレビュー。
// 実データ(data/machines)は一切編集せず、表示時に実機のJSONへ settingAim を載せるだけ。
// CLAUDE.md の「表示の都合はサイト側で吸収する」に沿う。
//
// 出率は実機の履歴（Lヴヴヴ2・2026-06-09〜06-10）から daily_rate と同じ式で算出:
//   実通常時G=Σ当選G（前兆32Gを加算）/ AT中G=Σ獲得÷純増ペース(9.0) / 総G=通常時G+AT中G
//   差枚=Σ獲得−使用枚数(1.53)×通常時G（履歴推定・差枚校正なし）/ IN=3×総G / 出率=(IN+差枚)÷IN
//   games=日別の総回転数(実通常時G)。※実通常時G<1000の台日は除外。値は scraper/daily_rate.py と一致。
export const dynamic = "force-static";

const SETTING_AIM: SettingAim = {
  label: "設定狙い（台番号別 推定出率）",
  unit: "%",
  note: "出率＝OUT÷IN（3枚掛け・即やめ想定／前兆32G加算・稼働1000G未満の日は除外）。AT中Gは純増ペースで推定（機種スペック依存）。100%超が続く台＝高設定候補。実機履歴（Lヴヴヴ2・2026-06-09〜06-10）からの推定値（差枚校正なし）。",
  dates: ["2026-06-09", "2026-06-10"],
  units: [
    { unit: "992", avg: 132.1, days: 2, rates: [150.0, 114.2], games: [1866, 5720], net: 6998 },
    { unit: "987", avg: 120.0, days: 2, rates: [122.0, 117.9], games: [1947, 5220], net: 5153 },
    { unit: "975", avg: 117.6, days: 2, rates: [105.8, 129.4], games: [6701, 4920], net: 7049 },
    { unit: "793", avg: 114.6, days: 2, rates: [115.2, 114.0], games: [2669, 3971], net: 3577 },
    { unit: "976", avg: 110.4, days: 2, rates: [142.5, 78.3], games: [3874, 4906], net: 3292 },
    { unit: "800", avg: 109.0, days: 2, rates: [109.8, 108.3], games: [5791, 5197], net: 3633 },
    { unit: "806", avg: 107.6, days: 2, rates: [120.4, 94.7], games: [2177, 4157], net: 930 },
    { unit: "967", avg: 107.1, days: 2, rates: [89.2, 125.0], games: [7215, 2872], net: 123 },
    { unit: "978", avg: 105.6, days: 2, rates: [103.0, 108.2], games: [7394, 4269], net: 2051 },
    { unit: "792", avg: 104.0, days: 1, rates: [104.0, null], games: [4644, 0], net: 659 },
    { unit: "798", avg: 103.0, days: 2, rates: [96.6, 109.5], games: [3818, 2288], net: 344 },
    { unit: "989", avg: 102.8, days: 2, rates: [108.6, 97.1], games: [3762, 3361], net: 836 },
    { unit: "980", avg: 101.7, days: 2, rates: [84.7, 118.7], games: [2122, 6721], net: 3627 },
    { unit: "973", avg: 101.6, days: 2, rates: [129.4, 73.7], games: [5805, 1071], net: 5741 },
    { unit: "972", avg: 98.8, days: 2, rates: [79.6, 118.1], games: [3217, 4015], net: 556 },
    { unit: "969", avg: 97.2, days: 2, rates: [83.1, 111.2], games: [7429, 4344], net: -2406 },
    { unit: "796", avg: 96.5, days: 2, rates: [87.5, 105.6], games: [6896, 4544], net: -1999 },
    { unit: "801", avg: 96.5, days: 2, rates: [97.6, 95.4], games: [2281, 2589], net: -608 },
    { unit: "1205", avg: 96.2, days: 2, rates: [97.8, 94.6], games: [3709, 3196], net: -888 },
    { unit: "984", avg: 95.4, days: 2, rates: [107.6, 83.2], games: [1014, 1867], net: -773 },
    { unit: "1216", avg: 94.7, days: 2, rates: [96.8, 92.6], games: [7032, 6557], net: -2456 },
    { unit: "790", avg: 94.0, days: 2, rates: [101.8, 86.3], games: [4571, 4208], net: -1658 },
    { unit: "1215", avg: 93.6, days: 2, rates: [85.6, 101.6], games: [3320, 5405], net: -1320 },
    { unit: "791", avg: 93.0, days: 2, rates: [80.0, 106.0], games: [2918, 6327], net: -581 },
    { unit: "979", avg: 92.0, days: 2, rates: [94.7, 89.3], games: [2082, 3696], net: -1742 },
    { unit: "990", avg: 90.4, days: 2, rates: [115.9, 64.9], games: [2760, 1746], net: -319 },
    { unit: "794", avg: 90.2, days: 2, rates: [120.8, 59.5], games: [6244, 2313], net: 1983 },
    { unit: "985", avg: 89.8, days: 2, rates: [102.4, 77.2], games: [6268, 1842], net: -849 },
    { unit: "991", avg: 88.8, days: 2, rates: [76.3, 101.4], games: [2112, 1749], net: -1562 },
    { unit: "981", avg: 88.4, days: 2, rates: [89.9, 86.9], games: [3667, 5908], net: -3887 },
    { unit: "974", avg: 88.3, days: 2, rates: [80.4, 96.3], games: [1656, 2906], net: -1460 },
    { unit: "970", avg: 88.1, days: 2, rates: [81.1, 95.1], games: [3871, 6397], net: -3521 },
    { unit: "797", avg: 86.7, days: 2, rates: [76.1, 97.2], games: [2300, 3152], net: -2127 },
    { unit: "971", avg: 86.3, days: 2, rates: [84.1, 88.6], games: [6352, 2767], net: -4464 },
    { unit: "805", avg: 85.0, days: 2, rates: [82.3, 87.8], games: [5154, 5921], net: -5489 },
    { unit: "988", avg: 83.3, days: 2, rates: [88.1, 78.5], games: [3561, 1543], net: -2552 },
    { unit: "803", avg: 83.1, days: 2, rates: [76.5, 89.7], games: [2130, 4708], net: -3315 },
    { unit: "802", avg: 82.0, days: 2, rates: [74.0, 90.1], games: [1048, 2209], net: -1661 },
    { unit: "799", avg: 81.2, days: 2, rates: [98.9, 63.4], games: [6840, 2037], net: -2628 },
    { unit: "986", avg: 80.8, days: 2, rates: [96.1, 65.5], games: [3394, 2086], net: -2768 },
    { unit: "977", avg: 80.5, days: 2, rates: [81.3, 79.8], games: [3526, 4750], net: -5373 },
    { unit: "968", avg: 79.9, days: 1, rates: [null, 79.9], games: [0, 3969], net: -2645 },
    { unit: "804", avg: 77.9, days: 1, rates: [null, 77.9], games: [0, 1045], net: -779 },
    { unit: "983", avg: 76.9, days: 1, rates: [null, 76.9], games: [0, 3003], net: -2285 },
    { unit: "982", avg: 75.0, days: 2, rates: [58.1, 91.9], games: [1016, 5610], net: -2922 },
    { unit: "1211", avg: 68.6, days: 2, rates: [70.5, 66.7], games: [5730, 4271], net: -9955 },
    { unit: "795", avg: 68.2, days: 2, rates: [65.7, 70.6], games: [2210, 1413], net: -3781 }
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
