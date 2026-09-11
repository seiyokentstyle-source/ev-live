import { getAvailableMachines } from "@/lib/machines";
import { machineSummary } from "@/lib/ev/summary";
import { MachineListClient } from "./MachineListClient";

export default async function MachinesPage() {
  const machines = await getAvailableMachines();
  return <MachineListClient machines={machines.map(machineSummary)} />;
}
