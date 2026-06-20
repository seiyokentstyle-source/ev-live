import { notFound } from "next/navigation";
import type { Machine } from "@/lib/ev/types";
import { validateMachine } from "@/lib/ev/validate";
import { MachineDetailClient } from "@/app/machines/[id]/MachineDetailClient";
import machineJson from "./machine.json";

// スクレイパーを動かさずに「期待値表」へ新しい収集日を足した状態を確認するためのプレビュー。
// 本番データ(data/machines)は一切編集せず、ここで生成済みの機種JSONをそのまま描画する。
// CLAUDE.md の「表示の都合はサイト側で吸収する」に沿う。
//
// machine.json は実機の履歴（Lヴヴヴ2・2026-06-09/06-10/06-17）から、本番と同じ
// scraper/make_evlive_data.py の forward EV アルゴリズムで生成（窓を9日に広げて3日分を合算）。
//   ・939セッション（6/09=387 + 6/10=356 + 6/17=196）＋打ち切り114台日を損失計上
//   ・件数(n)＝そのGに到達した（当たり＋打ち切り）台日数。本番は未生成で「—」だが本物の値を表示
export const dynamic = "force-static";

export default function EvTablePreviewPage() {
  let machine: Machine;
  try {
    machine = validateMachine(machineJson);
  } catch {
    notFound();
  }
  return <MachineDetailClient machine={machine} />;
}
