import { notFound } from "next/navigation";
import { getMachine, getMachineHallSummaries, getMachineIds } from "@/lib/machines";
import { HALLS, getHall } from "@/lib/halls";
import { MachineDetailClient } from "../MachineDetailClient";
import { HallPendingClient } from "./HallPendingClient";
import { getSavedTargetCatalog, getSavedTargetRefreshes } from "@/lib/saved-target-catalog";
import { buildLiveMachine } from "@/lib/live-data";

type MachineDetailPageProps = {
  params: Promise<{
    id: string;
    hall: string;
  }>;
};

export async function generateStaticParams() {
  const ids = await getMachineIds();
  // 機種 × 店舗の全組み合わせを書き出す。未集計の店舗も「準備中」ページとして
  // 静的に出しておく（リンクが 404 にならないように）。
  return ids.flatMap((id) => HALLS.map((hall) => ({ id, hall: hall.id })));
}

export default async function MachineDetailPage({ params }: MachineDetailPageProps) {
  const { id, hall: hallId } = await params;
  const hall = getHall(hallId);
  if (!hall) notFound();

  // ★その店舗のデータだけを見ること。既存（新宿）のJSONを他店の名前で出すと、
  //   別店舗の設定配分をその店のものとして見せることになり、判断を誤らせる。
  const hallMachine = hall.ready ? await getMachine(id, hall.dataSubdir) : undefined;
  if (!hallMachine) {
    const machine = (await getMachineHallSummaries(id))[0]?.summary;
    if (!machine) notFound();
    return <HallPendingClient machine={machine} hall={hall} />;
  }

  const [catalog, refreshed] = await Promise.all([getSavedTargetCatalog(), getSavedTargetRefreshes(id, hall.dataSubdir)]);
  const snapshot = buildLiveMachine(hallMachine, hall.id, catalog, refreshed);
  return <MachineDetailClient machine={snapshot.machine} hall={hall} savedTargets={snapshot.savedTargets} revision={snapshot.revision} />;
}
