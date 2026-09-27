import { getMachineListSummaries } from "@/lib/machines";
import { MachineListClient } from "./MachineListClient";

export default async function MachinesPage() {
  return <MachineListClient machines={await getMachineListSummaries()} />;
}
