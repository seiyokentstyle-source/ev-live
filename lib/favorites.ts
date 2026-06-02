export const FAVORITES_STORAGE_KEY = "evlive.favorites.v1";

export type FavoriteMap = Record<string, boolean>;

export function readFavorites(): FavoriteMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")
    );
  } catch {
    return {};
  }
}

export function writeFavorites(favorites: FavoriteMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    // Local storage can fail in private browsing. The in-memory state still works for this session.
  }
}
