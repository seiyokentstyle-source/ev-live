import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MachineListClient } from "../app/machines/MachineListClient";
import { MachineCard } from "../components/machine-list/MachineCard";
import { FAVORITES_STORAGE_KEY } from "../lib/favorites";
import type { Machine } from "../lib/ev/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const machines = [
  { id: "many", name: "機種A", meta: { samples: "100" } },
  { id: "favorite", name: "機種B", meta: { samples: "10" } }
].map((machine) => ({
  ...machine,
  manufacturer: "メーカー",
  aliases: [],
  releaseDate: "2026-01-01",
  thumb: null
})) as Machine[];

afterEach(() => vi.unstubAllGlobals());

describe("機種一覧の初期表示", () => {
  it("保存済みのお気に入りがあっても、初回描画はサーバーHTMLと一致する", () => {
    const serverHtml = renderToString(createElement(MachineListClient, { machines }));
    const getItem = vi.fn((key: string) =>
      key === FAVORITES_STORAGE_KEY ? JSON.stringify({ favorite: true }) : null
    );
    vi.stubGlobal("window", { localStorage: { getItem } });

    // Effects have not run at this stage, just as during the hydration render.
    const firstClientHtml = renderToString(createElement(MachineListClient, { machines }));
    expect(firstClientHtml).toBe(serverHtml);
    expect(getItem).not.toHaveBeenCalled();
  });
});

describe("機種カードのキー操作", () => {
  it.each(["Enter", " "])("カード上の %s は詳細ページを開く", (key) => {
    const onOpen = vi.fn();
    const card = MachineCard({ machine: machines[0], isFavorite: false, match: { type: "none" }, onOpen, onToggleFavorite: vi.fn() });
    const target = {};
    const preventDefault = vi.fn();
    card.props.onKeyDown({ key, target, currentTarget: target, preventDefault });
    expect(onOpen).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it.each(["Enter", " "])("お気に入りボタンから伝わる %s はページを開かない", (key) => {
    const onOpen = vi.fn();
    const card = MachineCard({ machine: machines[0], isFavorite: false, match: { type: "none" }, onOpen, onToggleFavorite: vi.fn() });
    const preventDefault = vi.fn();
    card.props.onKeyDown({ key, target: {}, currentTarget: {}, preventDefault });
    expect(onOpen).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
