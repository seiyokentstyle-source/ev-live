"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Machine } from "@/lib/ev/types";
import { readFavorites, writeFavorites, type FavoriteMap } from "@/lib/favorites";
import { normalizeSearchText } from "@/lib/search/normalize";
import { MachineCard, type MachineSearchMatch } from "@/components/machine-list/MachineCard";
import { MakerFilter } from "@/components/machine-list/MakerFilter";
import { SearchInput } from "@/components/machine-list/SearchInput";
import { EmptyState, TableFoot } from "@/components/ui/DataTable";

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
      {/* 詳細ページのヘッダーと同じ骨格・同じ余白。件数は他ページと揃えてフッターの左に出す。 */}
      <header className="glass-surface flex shrink-0 items-end justify-between gap-3 px-4 py-3">
        <div>
          {/* ロゴは発光させず、Ice Blue → Pale Pink の屈折で色が変わったように見せる。 */}
          <p className="logo-gradient mono text-[11px] font-bold tracking-[0.24em]">EV LIVE</p>
          <h1 className="mt-0.5 text-base font-black tracking-tight text-ink">機種一覧</h1>
        </div>
        <p className="mono pb-0.5 text-[10px] text-muted">期待値ガチ勢向け</p>
      </header>

      {/* 検索＋メーカー絞り込みはヘッダーの直下に密着させる。詳細ページの ControlBar と
          同じ「バーを積む」骨格に揃える形。以前は main の中で sticky にしており、
          main の py-3 を -mt-3 で打ち消してから pt-3 で入れ直していたため、
          ヘッダーの境界線と検索欄の間に背景色だけの帯が12px残っていた。
          main の外＝スクロール領域の外に出すので、sticky を使わずに常時表示のままになる。 */}
      <div className="glass-surface shrink-0 px-4 pb-2.5 pt-3">
        <SearchInput value={query} onChange={setQuery} />
        <div className="mt-2.5">
          <MakerFilter makers={makers} value={maker} favoriteCount={favoriteCount} onChange={setMaker} />
        </div>
      </div>

      {/* Layer 2 が並ぶ面。overscroll-contain で iOS の rubber-band が
          背景ごと動くのを止める。 */}
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch]">
        {results.length > 0 ? (
          <div className="grid grid-cols-2 items-stretch gap-3 pb-2">
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
          <EmptyState>{emptyText}</EmptyState>
        )}
      </main>

      <TableFoot
        left={`${results.length.toLocaleString("ja-JP")}件 / 全${machines.length.toLocaleString("ja-JP")}機種`}
        right="登録不要で閲覧可"
      />
    </div>
  );
}
