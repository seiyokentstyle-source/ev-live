import { notFound } from "next/navigation";
import { getMachineHallSummaries, getMachineIds } from "@/lib/machines";
import { HallSelectClient } from "./HallSelectClient";

type MachineHallPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function generateStaticParams() {
  return (await getMachineIds()).map((id) => ({ id }));
}

/** 機種を選んだ直後の店舗選択ページ。
 *  期待値表そのものは /machines/<id>/<店舗id> 側にある。 */
export default async function MachineHallPage({ params }: MachineHallPageProps) {
  const { id } = await params;
  const hallMachines = await getMachineHallSummaries(id);
  const machine = hallMachines[0]?.summary;
  if (!machine) notFound();
  return <HallSelectClient machine={machine} hallMachines={hallMachines} />;
}
