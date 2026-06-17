"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Machine } from "@/lib/ev/types";
import { readFavorites, writeFavorites, type FavoriteMap } from "@/lib/favorites";
import { normalizeSearchText } from "@/lib/search/normalize";
import { MachineCard, type MachineSearchMatch } from "@/components/machine-list/MachineCard";
import { MakerFilter } from "@/components/machine-list/MakerFilter";
import { SearchInput } from "@/components/machine-list/SearchInput";

type MachineListClientProps = {
  machines: Machine[];
};

type MachineResult = {
  machine: Machine;
  match: MachineSearchMatch;
  isFavorite: boolean;
};

function getSearchMatch(machine: Machine, query: string): MachineSearchMatch | null {
  if (query.length === 0) return { type: "none" };
  const normalizedName = normalizeSearchText(machine.name);
  if (normalizedName.includes(query)) return { type: "name" };

  const alias = machine.aliases.find((candidate) => normalizeSearchText(candidate).includes(query));
  if (alias) return { type: "alias", label: alias };

  return null;
}

export function MachineListClient({ machines }: MachineListClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [maker, setMaker] = useState("all");
  const [favorites, setFavorites] = useState<FavoriteMap>(() => readFavorites());

  const makers = useMemo(() => Array.from(new Set(machines.map((machine) => machine.manufacturer))).sort(), [machines]);
  const favoriteCount = useMemo(() => machines.filter((machine) => favorites[machine.id]).length, [favorites, machines]);
  const normalizedQuery = normalizeSearchText(query);

  const results = useMemo<MachineResult[]>(() => {
    return machines
      .map((machine) => {
        const match = getSearchMatch(machine, normalizedQuery);
        return match ? { machine, match, isFavorite: Boolean(favorites[machine.id]) } : undefined;
      })
      .filter((result): result is MachineResult => result !== undefined)
      .filter((result) => {
        if (maker === "favorites") return result.isFavorite;
        if (maker === "all") return true;
        return result.machine.manufacturer === maker;
      })
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        return b.machine.releaseDate.localeCompare(a.machine.releaseDate);
      });
  }, [favorites, maker, machines, normalizedQuery]);

  function toggleFavorite(id: string): void {
    setFavorites((current) => {
      const next = { ...current, [id]: !current[id] };
      if (!next[id]) delete next[id];
      writeFavorites(next);
      return next;
    });
  }

  const emptyText =
    maker === "favorites"
      ? "機種の右上の ☆ をタップで登録"
      : query
        ? "条件に一致する機種がありません"
        : "表示できる機種がありません";

  return (
    <div className="app-shell">
      <header className="shrink-0 border-b border-line bg-panel px-4 py-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="mono text-[10px] tracking-[0.22em] text-highlight">EV LIVE</p>
            <h1 className="mt-1 text-lg font-black">機種一覧</h1>
          </div>
          <p className="mono text-xs text-ink-soft">{results.length}件</p>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="sticky top-0 z-20 -mx-4 -mt-4 border-b border-line bg-bg px-4 pb-3 pt-4">
          <SearchInput value={query} onChange={setQuery} />
          <div className="mt-3">
            <MakerFilter makers={makers} value={maker} favoriteCount={favoriteCount} onChange={setMaker} />
          </div>
        </div>

        {results.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 py-4">
            {results.map((result) => (
              <MachineCard
                key={result.machine.id}
                machine={result.machine}
                isFavorite={result.isFavorite}
                match={result.match}
                onOpen={() => router.push(`/machines/${result.machine.id}`)}
                onToggleFavorite={() => toggleFavorite(result.machine.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid h-56 place-items-center text-center">
            <p className="text-sm text-ink-soft">{emptyText}</p>
          </div>
        )}
      </main>

      <footer className="mono shrink-0 border-t border-line bg-panel px-4 py-3 text-[10px] text-muted">
        EV LIVE / 登録不要で閲覧可
      </footer>
    </div>
  );
}
