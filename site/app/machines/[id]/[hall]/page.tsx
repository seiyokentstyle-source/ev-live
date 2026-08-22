import { notFound } from "next/navigation";
import { getMachine, getMachines } from "@/lib/machines";
import { HALLS, getHall } from "@/lib/halls";
import { MachineDetailClient } from "../MachineDetailClient";
import { HallPendingClient } from "./HallPendingClient";

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
  const machine = await getMachine(id);
  const hall = getHall(hallId);
  if (!machine || !hall) notFound();

  // ★未集計の店舗に既存データ（新宿）を出さないこと。別店舗の設定配分を
  //   その店のものとして見せることになり、期待値の判断を誤らせる。
  if (!hall.ready) return <HallPendingClient machine={machine} hall={hall} />;

  return <MachineDetailClient machine={machine} hall={hall} />;
}
