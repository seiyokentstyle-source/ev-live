import { getAvailableMachines } from "@/lib/machines";
import { MachineListClient } from "./machines/MachineListClient";

// Render the machine list directly at "/" instead of redirect("/machines").
// On GitHub Pages the site is served under basePath=/ev-live; a bare redirect
// target ("/machines") drops the basePath and 404s, and redirect() is awkward
// under static export. Rendering the list here keeps the home route working.
export default async function HomePage() {
  const machines = await getAvailableMachines();
  return <MachineListClient machines={machines} />;
}
