import type { MachineSummary } from "./ev/types";

type Identity = Pick<MachineSummary, "id" | "name">;

// Display/navigation equivalence only. Stored IDs, counter rules and payloads stay intact.
const GROUPS: readonly (readonly Identity[])[] = [
  [{ id: "m020bda5f", name: "スマスロパリピ孔明" }, { id: "m4ab6796b", name: "Lパリピ孔明" }],
  [{ id: "m8a798229", name: "スマスロ 獣王" }, { id: "m2bcf2c11", name: "L獣王" }],
  [{ id: "mebc58d07", name: "スマスロ モンスターハンターライズ：サンブレイク" },
    { id: "m04a5dfa2", name: "Lモンスターハンターライズ：サンブレイク" }],
  [{ id: "m50246ef0", name: "スマスロ 東京リベンジャーズ" },
    { id: "m39a9f4f4", name: "スマスロ 東京リベンジャーズ(リベスロ)" }],
];

function knownGroup(machine: Identity) {
  return GROUPS.find(group => group.some(member => member.id === machine.id && member.name === machine.name));
}

export function machineSelectionKey(machine: Identity): string {
  const group = knownGroup(machine);
  // The namespace keeps an unexpected name on a registered ID out of its alias group.
  return group ? `group:${group[0].id}` : `id:${machine.id}`;
}

export function sameMachineSelection(a: Identity, b: Identity): boolean {
  return a.id === b.id || Boolean(knownGroup(a) && knownGroup(a) === knownGroup(b));
}

/** Both original URLs remain valid; a candidate still needs its exact registered name. */
export function machineRouteIds(id: string): string[] {
  const group = GROUPS.find(group => group.some(member => member.id === id));
  return group ? [id, ...group.map(member => member.id).filter(candidate => candidate !== id)] : [id];
}

export function matchesMachineRoute(id: string, machine: Identity): boolean {
  return machine.id === id || Boolean(knownGroup(machine)?.some(member => member.id === id));
}

export function preferredMachineIdentity(candidate: Identity, current: Identity): boolean {
  const group = knownGroup(candidate);
  return Boolean(group && group === knownGroup(current) && candidate.id === group[0].id && current.id !== group[0].id);
}

export function hasNumericSamples(machine: MachineSummary): boolean {
  return /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(machine.meta.samples)
    && Number(machine.meta.samples.replace(/,/g, "")) > 0;
}

export function preferMachineSummary(candidate: MachineSummary, current: MachineSummary): boolean {
  // Preserve existing default-hall metadata selection for every unrelated machine.
  if (!knownGroup(candidate) || knownGroup(candidate) !== knownGroup(current)) return false;
  if (hasNumericSamples(candidate) !== hasNumericSamples(current)) return hasNumericSamples(candidate);
  return preferredMachineIdentity(candidate, current);
}

export function machineFavoriteIds(machine: Identity): string[] {
  return knownGroup(machine)?.map(member => member.id) ?? [machine.id];
}

export function machineSearchAliases(machine: MachineSummary): string[] {
  const group = knownGroup(machine);
  return group ? [...new Set([...machine.aliases, ...group.map(member => member.name)])] : machine.aliases;
}
