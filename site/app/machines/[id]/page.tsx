import { notFound } from "next/navigation";
import { getMachine, getMachines } from "@/lib/machines";
import { HallSelectClient } from "./HallSelectClient";

type MachineHallPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function generateStaticParams() {
  const machines = await getMachines();
  return machines.map((machine) => ({ id: machine.id }));
}

/** 機種を選んだ直後の店舗選択ページ。
 *  期待値表そのものは /machines/<id>/<店舗id> 側にある。 */
export default async function MachineHallPage({ params }: MachineHallPageProps) {
  const { id } = await params;
  const machine = await getMachine(id);
  if (!machine) notFound();
  return <HallSelectClient machine={machine} />;
}
