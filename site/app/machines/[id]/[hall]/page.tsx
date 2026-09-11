import { notFound } from "next/navigation";
import { getMachine, getMachines } from "@/lib/machines";
import { HALLS, getHall } from "@/lib/halls";
import { MachineDetailClient } from "../MachineDetailClient";
import { HallPendingClient } from "./HallPendingClient";
import { getSavedTargetCatalog, getSavedTargetRefreshes } from "@/lib/saved-target-catalog";
import { buildLiveMachine } from "@/lib/live-data";
import { machineSummary } from "@/lib/ev/summary";

type MachineDetailPageProps = {
  params: Promise<{
    id: string;
    hall: string;
  }>;
};

export async function generateStaticParams() {
  const machines = await getMachines();
  // 機種 × 店舗の全組み合わせを書き出す。未集計の店舗も「準備中」ページとして
  // 静的に出しておく（リンクが 404 にならないように）。
  return machines.flatMap((machine) => HALLS.map((hall) => ({ id: machine.id, hall: hall.id })));
}

export default async function MachineDetailPage({ params }: MachineDetailPageProps) {
  const { id, hall: hallId } = await params;
  const hall = getHall(hallId);
  if (!hall) notFound();

  // 機種一覧そのものは既定店舗のJSONから引く（URLの機種idを解決するため）。
  // 表に出す数字は必ずその店舗のフォルダから読み直す（下の hallMachine）。
  const machine = await getMachine(id);
  if (!machine) notFound();

  // ★その店舗のデータだけを見ること。既存（新宿）のJSONを他店の名前で出すと、
  //   別店舗の設定配分をその店のものとして見せることになり、判断を誤らせる。
  const hallMachine = hall.dataSubdir ? await getMachine(id, hall.dataSubdir) : machine;
  if (!hall.ready || !hallMachine) return <HallPendingClient machine={machineSummary(machine)} hall={hall} />;

  const [catalog, refreshed] = await Promise.all([getSavedTargetCatalog(), getSavedTargetRefreshes(id, hall.dataSubdir)]);
  const snapshot = buildLiveMachine(hallMachine, hall.id, catalog, refreshed);
  return <MachineDetailClient machine={snapshot.machine} hall={hall} savedTargets={snapshot.savedTargets} revision={snapshot.revision} />;
}
