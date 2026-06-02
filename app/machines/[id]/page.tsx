import { notFound } from "next/navigation";
import { getMachine, getMachines } from "@/lib/machines";
import { MachineDetailClient } from "./MachineDetailClient";

type MachineDetailPageProps = {
  params: {
    id: string;
  };
};

export async function generateStaticParams() {
  const machines = await getMachines();
  return machines.map((machine) => ({ id: machine.id }));
}

export default async function MachineDetailPage({ params }: MachineDetailPageProps) {
  const machine = await getMachine(params.id);
  if (!machine) notFound();
  return <MachineDetailClient machine={machine} />;
}
