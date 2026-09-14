import type { Machine } from "./ev/types";

// Older collector output gave the first SAO the sequel's date and aliases.
// Keep display metadata correct until those JSON files are regenerated.
// Product references: https://www.daitogiken.com/contents/product/slot/sao/
// and https://www.daitogiken.com/contents/product/slot/sao2/
const SAO_METADATA: Record<string, Pick<Machine, "name" | "releaseDate" | "aliases">> = {
  m49d497e0: {
    name: "Lソードアート・オンライン",
    releaseDate: "2023-05-15",
    aliases: ["Lソードアート・オンライン", "SAO", "SAO初代", "ソードアートオンライン"],
  },
  mfb4da289: {
    name: "ソードアート・オンラインII",
    releaseDate: "2026-06-08",
    aliases: ["ソードアート・オンラインII", "SAO2", "SAOⅡ", "SAOII", "ソードアートオンライン2", "ソードアート・オンラインⅡ"],
  },
};

/** Match both the stable ID and complete name; never match a series substring. */
export function normalizeMachineMetadata(machine: Machine): Machine {
  const metadata = SAO_METADATA[machine.id];
  if (!metadata || metadata.name !== machine.name) return machine;
  return { ...machine, releaseDate: metadata.releaseDate, aliases: [...metadata.aliases] };
}
