import { notFound } from "next/navigation";
import type { Machine } from "@/lib/ev/types";
import { validateMachine } from "@/lib/ev/validate";
import { MachineDetailClient } from "@/app/machines/[id]/MachineDetailClient";
import machineJson from "./machine.json";
import settingAimJson from "../setting-aim/settingAim.json";

// スクレイパーを動かさずに、期待値表・設定狙い・AT獲得をまとめて確認するためのプレビュー。
// 本番データ(data/machines)は一切編集せず、生成済みの機種JSON＋設定狙いを描画する。
// CLAUDE.md の「表示の都合はサイト側で吸収する」に沿う。
//
// machine.json は実機履歴（Lヴヴヴ2・2026-06-09/06-10/06-17）から本番と同じ
// scraper/make_evlive_data.py で生成（朝一除外・全データ）。settingAim は build_setting_aim 由来。
export const dynamic = "force-static";

export default function EvTablePreviewPage() {
  let machine: Machine;
  try {
    machine = validateMachine({ ...machineJson, settingAim: settingAimJson });
  } catch {
    notFound();
  }
  return <MachineDetailClient machine={machine} />;
}
