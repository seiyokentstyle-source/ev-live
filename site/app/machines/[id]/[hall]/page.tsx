import { notFound } from "next/navigation";
import { getMachineHallSummaries, getMachineIds } from "@/lib/machines";
import { getVisibleHalls, getHall, isListedHall } from "@/lib/halls";
import { LiveMachineClient } from "../MachineDetailClient";
import { HallPendingClient } from "./HallPendingClient";
import { getLiveMachine } from "@/lib/live-data";

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
  return ids.flatMap((id) => getVisibleHalls().map((hall) => ({ id, hall: hall.id })));
}

export default async function MachineDetailPage({ params }: MachineDetailPageProps) {
  const { id, hall: hallId } = await params;
  const hall = getHall(hallId);
  if (!isListedHall(hall)) notFound();

  // ★その店舗のデータだけを見ること。既存（新宿）のJSONを他店の名前で出すと、
  //   別店舗の設定配分をその店のものとして見せることになり、判断を誤らせる。
  const snapshot = hall.ready ? await getLiveMachine(id, hall.id) : undefined;
  if (!snapshot) {
    const machine = (await getMachineHallSummaries(id))[0]?.summary;
    if (!machine) notFound();
    return <HallPendingClient machine={machine} hall={hall} />;
  }

  return <LiveMachineClient initial={snapshot} hall={hall} />;
}
