// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HeatmapClient } from "../app/halls/shinjuku/heatmap/HeatmapClient";
import { HEATMAP_GROUP_KEYS, type FloorLayout, type HeatmapData } from "../lib/heatmap/types";

const floor: FloorLayout = {
  width: 200, height: 100, sourceUrl: "https://example.com/layout", asOf: "配置基準日未記載",
  layoutNote: "図にない台の位置は推定しません。",
  seats: [
    { unit: "1001", x: 10, y: 10, width: 40, height: 25 },
    { unit: "1002", x: 60, y: 10, width: 40, height: 25 },
  ],
};
const data: HeatmapData = {
  schema: "evlive-floor-heatmap/v1", hallId: "kabuki", metric: "net", estimated: true,
  dataFrom: "2026-10-21", dataTo: "2026-10-21",
  groups: HEATMAP_GROUP_KEYS.map((key) => ({
    key, label: key, firstDate: key === "all" ? "2026-10-21" : null,
    lastDate: key === "all" ? "2026-10-21" : null,
    units: key === "all" ? [
      { unit: "1001", days: 1, net: 500 }, { unit: "2001", days: 1, net: -300 },
    ] : [],
  })),
};

beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("compact heatmap controls", () => {
  it("starts with panels closed, opens help, and restores button focus on Escape", () => {
    render(<HeatmapClient hallId="kabuki" data={data} floor={floor} />);
    expect(screen.queryByRole("region", { name: "ヒートマップの使い方" })).toBeNull();
    expect(screen.queryByRole("region", { name: "選択した台の詳細" })).toBeNull();
    const help = screen.getByRole("button", { name: "使い方" });
    fireEvent.click(help);
    const panel = screen.getByRole("region", { name: "ヒートマップの使い方" });
    expect(help.getAttribute("aria-expanded")).toBe("true");
    expect(within(panel).getByText("図にない台の位置は推定しません。")).toBeTruthy();
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(help.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(help);
  });

  it("opens the selected seat detail and closes it without leaving the panel in the map flow", () => {
    render(<HeatmapClient hallId="kabuki" data={data} floor={floor} />);
    fireEvent.click(screen.getByRole("button", { name: /1001番台、平均差枚/ }));
    const panel = screen.getByRole("region", { name: "選択した台の詳細" });
    expect(within(panel).getByText("+500枚")).toBeTruthy();
    expect(within(panel).getByText("1日")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "台の詳細を閉じる" }));
    expect(screen.queryByRole("region", { name: "選択した台の詳細" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /台の詳細/ }));
  });

  it("keeps an unmapped observation selectable without inventing a map seat", () => {
    render(<HeatmapClient hallId="kabuki" data={data} floor={floor} />);
    expect(screen.queryByRole("button", { name: /2001番台/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /配置未確認/ }));
    const list = screen.getByRole("region", { name: "配置未確認の台" });
    fireEvent.click(within(list).getByRole("button", { name: /2001番台、配置未確認/ }));
    expect(within(screen.getByRole("region", { name: "選択した台の詳細" })).getByText("-300枚")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "配置未確認の台" })).toBeNull();
    expect(screen.getByRole("main").querySelectorAll("button[aria-pressed]")).toHaveLength(2);
  });

  it("keeps store navigation explicit and zoom controls operable", () => {
    render(<HeatmapClient hallId="kabuki" data={data} floor={floor} />);
    expect(screen.getByRole("link", { name: "エスパス歌舞伎町" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "アイランド秋葉原" }).getAttribute("href")).toBe("/halls/akihabara/heatmap");
    fireEvent.click(screen.getByRole("button", { name: "島図を拡大" }));
    expect(screen.getByLabelText("表示倍率").textContent).toBe("125%");
    fireEvent.click(screen.getByRole("button", { name: "戻す" }));
    expect(screen.getByLabelText("表示倍率").textContent).toBe("100%");
    fireEvent.change(screen.getByLabelText("日付"), { target: { value: "1" } });
    expect(screen.getByText("この日付条件のデータはまだありません。")).toBeTruthy();
  });
});
