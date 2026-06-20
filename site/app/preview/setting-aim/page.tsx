import { notFound } from "next/navigation";
import type { Machine } from "@/lib/ev/types";
import { validateMachine } from "@/lib/ev/validate";
import { MachineDetailClient } from "@/app/machines/[id]/MachineDetailClient";
import machineJson from "../ev-table/machine.json";
import settingAimJson from "./settingAim.json";

// スクレイパーを動かさずに「設定狙い」モードのUIを確認するためのプレビュー。
// 本番データ(data/machines)は一切編集せず、ここで生成済みの機種JSON＋設定狙いを描画する。
// CLAUDE.md の「表示の都合はサイト側で吸収する」に沿う。
//
// データは実機履歴（Lヴヴヴ2・2026-06-09 / 06-10 / 06-17）から本番と同じ
// scraper/make_evlive_data.py で生成（期待値表＝forward EV、設定狙い＝daily_rate の出率）。
//   ・期待値表: 939セッション＋打ち切り114台日、件数(n)も実数
//   ・設定狙い: 台番号別 推定出率(OUT÷IN)。前兆32G加算・稼働1000G未満の台日は除外・差枚は履歴推定
export const dynamic = "force-static";

export default function SettingAimPreviewPage() {
  let machine: Machine;
  try {
    machine = validateMachine({ ...machineJson, settingAim: settingAimJson });
  } catch {
    notFound();
  }
  return <MachineDetailClient machine={machine} />;
}
