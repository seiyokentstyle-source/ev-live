import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HeatmapClient } from "../app/halls/shinjuku/heatmap/HeatmapClient";
import { averageNet, formatNet, groupLabel, heatColor, heatmapGroupDateRange, initialMapScroll, PENDING_HEAT_COLOR, summarizeUnits, validateHeatmapData } from "../lib/heatmap/values";
import { HEATMAP_GROUP_KEYS, type FloorLayout, type HeatmapData } from "../lib/heatmap/types";

const data: HeatmapData = {
  schema: "evlive-floor-heatmap/v1", hallId: "shinjuku", metric: "net", estimated: true,
  dataFrom: "2026-09-01", dataTo: "2026-09-19",
  groups: [
    { key: "all", label: "日付不問", firstDate: "2026-09-01", lastDate: "2026-09-19", units: [
      { unit: "1001", days: 2, net: 4000 }, { unit: "1002", days: 4, net: -8000 }, { unit: "1003", days: 1, net: 0 }
    ] },
    { key: "1", label: "1のつく日", firstDate: "2026-09-01", lastDate: "2026-09-19", units: [{ unit: "1001", days: 1, net: 0 }] },
    ...HEATMAP_GROUP_KEYS.filter((key) => key !== "all" && key !== "1").map((key) => ({ key, label: groupLabel(key), firstDate: null, lastDate: null, units: [] }))
  ]
};

const floor: FloorLayout = {
  width: 200, height: 200, sourceUrl: "https://example.test/floor.png", asOf: "2026-09-19",
  seats: ["1001", "1002", "1003", "1004"].map((unit, index) => ({ unit, x: index * 40, y: 20, width: 30, height: 30 }))
};

describe("floor heatmap averages", () => {
  it("starts on the first numbered island instead of the original floor's blank top-left", () => {
    const source: FloorLayout = { ...floor, width: 2868, height: 3036, seats: [{ unit: "650", x: 879, y: 150, width: 42, height: 41 }] };
    const scroll = initialMapScroll(source, 2300, 390);
    const left = 879 * (2300 / 2868) + 16 - scroll.left;
    expect(left).toBe(78);
    expect(scroll.top).toBeGreaterThan(0);
    expect(initialMapScroll({ ...source, seats: [] }, 2300, 390)).toEqual({ left: 0, top: 0 });
  });

  it("divides accumulated net by observed days, without filling missing days with zero", () => {
    expect(averageNet({ unit: "1", net: 4000, days: 2 })).toBe(2000);
    expect(averageNet({ unit: "1", net: 0, days: 2 })).toBe(0);
    expect(averageNet(undefined)).toBeNull();
    expect(averageNet({ unit: "1", net: 0, days: 0 })).toBeNull();
  });

  it("weights combined aggregates by days rather than averaging per-machine averages", () => {
    expect(summarizeUnits([{ unit: "1", days: 1, net: 1000 }, { unit: "2", days: 9, net: -9000 }])).toEqual({ days: 10, net: -8000, average: -800 });
    expect(summarizeUnits([])).toEqual({ days: 0, net: 0, average: null });
  });

  it("distinguishes measured zero from missing data and keeps colors independent of current group", () => {
    expect(heatColor(null)).not.toEqual(heatColor(0));
    expect(heatColor(0).empty).toBe(false);
    expect(heatColor(-1000).background).not.toBe(heatColor(1000).background);
    expect(heatColor(averageNet(data.groups[0].units[0]))).toEqual(heatColor(2000));
    expect(heatColor(4000)).toEqual(heatColor(2000));
    expect(heatColor(Number.NaN).empty).toBe(true);
  });

  it("labels sign, zero, absence and the default date clearly", () => {
    expect(formatNet(1000.2)).toBe("+1,000枚");
    expect(formatNet(-1000)).toBe("-1,000枚");
    expect(formatNet(0)).toBe("0枚");
    expect(formatNet(-0.2)).toBe("0枚");
    expect(formatNet(null)).toBe("データなし");
    expect(groupLabel("all")).toBe("日付不問");
    expect(groupLabel("1")).toBe("1のつく日");
  });
});

describe("floor heatmap aggregate contract", () => {
  it("accepts aggregate-only data and empty date groups", () => {
    expect(validateHeatmapData(data)).toEqual(data);
    expect(validateHeatmapData(data).groups).toHaveLength(11);
  });

  it("validates the observed through-date of a historical fallback", () => {
    expect(validateHeatmapData({ ...data, snapshotFallbackTo: "2026-09-11" }).snapshotFallbackTo).toBe("2026-09-11");
    for (const date of [null, 20260911, "2026-02-30", "2026-08-31", "2026-09-20"]) {
      expect(() => validateHeatmapData({ ...data, snapshotFallbackTo: date })).toThrow();
    }
  });

  it.each([
    ["negative days", { ...data.groups[0].units[0], days: -1 }],
    ["fractional days", { ...data.groups[0].units[0], days: 1.5 }],
    ["zero days", { ...data.groups[0].units[0], days: 0 }],
    ["NaN net", { ...data.groups[0].units[0], net: Number.NaN }],
    ["text net", { ...data.groups[0].units[0], net: "100" }]
  ])("rejects %s", (_, unit) => {
    expect(() => validateHeatmapData({ ...data, groups: [{ ...data.groups[0], units: [unit] }, ...data.groups.slice(1)] })).toThrow();
  });

  it("rejects duplicate units/groups, invalid dates and the wrong metric", () => {
    expect(() => validateHeatmapData({ ...data, metric: "rtp" })).toThrow();
    expect(() => validateHeatmapData({ ...data, dataFrom: "2026-02-30" })).toThrow();
    expect(() => validateHeatmapData({ ...data, dataFrom: "2026-10-01" })).toThrow();
    expect(() => validateHeatmapData({ ...data, groups: [data.groups[0], data.groups[0]] })).toThrow();
    expect(() => validateHeatmapData({ ...data, groups: [{ ...data.groups[0], units: [data.groups[0].units[0], data.groups[0].units[0]] }] })).toThrow();
    expect(() => validateHeatmapData({ ...data, groups: [data.groups[1]] })).toThrow();
  });

  it("requires all date groups and rejects impossible day counts or mismatched coverage", () => {
    const altered = (index: number, patch: object) => ({ ...data, groups: data.groups.map((group, at) => at === index ? { ...group, ...patch } : group) });
    expect(() => validateHeatmapData({ ...data, groups: data.groups.slice(0, -1) })).toThrow();
    expect(() => validateHeatmapData(altered(0, { units: [{ unit: "1001", days: 20, net: 0 }] }))).toThrow();
    expect(() => validateHeatmapData(altered(1, { units: [{ unit: "1001", days: 3, net: 0 }] }))).toThrow();
    expect(() => validateHeatmapData(altered(1, { units: [{ unit: "9999", days: 1, net: 0 }] }))).toThrow();
    expect(() => validateHeatmapData(altered(0, { firstDate: "2026-09-02" }))).toThrow();
    expect(() => validateHeatmapData(altered(2, { firstDate: "2026-09-02", lastDate: "2026-09-02" }))).toThrow();
  });
});

describe("floor heatmap presentation", () => {
  it("starts with both information panels closed above the map", () => {
    const html = renderToStaticMarkup(<HeatmapClient data={data} floor={floor} />);
    expect(html).toMatch(/<button[^>]*aria-controls="heatmap-details"[^>]*aria-expanded="false"/);
    expect(html).toMatch(/<button[^>]*aria-controls="heatmap-help"[^>]*aria-expanded="false"/);
    expect(html).toMatch(/<section id="heatmap-details"[^>]*hidden=""/);
    expect(html).toMatch(/<section id="heatmap-help"[^>]*hidden=""/);
    expect(html.indexOf('id="heatmap-details"')).toBeLessThan(html.indexOf("<main"));
    expect(html.indexOf('id="heatmap-help"')).toBeLessThan(html.indexOf("<main"));
    expect(html).toContain('aria-label="台の詳細を閉じる"');
    expect(html).toContain('aria-label="使い方を閉じる"');
    expect(html).not.toContain("<footer");
    expect(html).not.toMatch(/<button[^>]*aria-controls="heatmap-unplaced"/);
  });

  it.each([
    ["shinjuku", "新宿"],
    ["akihabara", "アイランド秋葉原"],
    ["kabuki", "エスパス歌舞伎町"],
  ] as const)("labels %s and links all three heatmaps without changing the seat data", (hallId, title) => {
    const html = renderToStaticMarkup(<HeatmapClient data={data} floor={floor} hallId={hallId} />);
    expect(html).toContain(`<h1>${title} <span>`);
    expect(html).toContain(`aria-label="${title}の島図。上下左右にスクロールできます"`);
    const currentLinks = html.match(/<a\b[^>]*aria-current="page"[^>]*>/g);
    expect(currentLinks).toHaveLength(1);
    expect(currentLinks![0]).toContain(`href="/halls/${hallId}/heatmap"`);
    expect(currentLinks![0]).toContain(`aria-label="${title}"`);
    for (const id of ["shinjuku", "akihabara", "kabuki"]) expect(html).toContain(`href="/halls/${id}/heatmap"`);
    expect(html).toContain("1001番台、平均差枚（推定）+2,000枚、対象2日");
  });

  it("keeps unmapped measured and pending units in a separate list without inventing positions", () => {
    const withUnplaced: HeatmapData = { ...data, groups: data.groups.map((group) => group.key === "all" ? {
      ...group,
      units: [...group.units, { unit: "9999", days: 2, net: 600 }],
      pendingUnits: [{ unit: "8888", days: 2, firstDate: "2026-09-01", lastDate: "2026-09-02", reasons: ["獲得未集計"] }],
    } : group) };
    const html = renderToStaticMarkup(<HeatmapClient data={withUnplaced} floor={floor} />);
    expect(html).toContain('aria-controls="heatmap-unplaced" aria-expanded="false"');
    expect(html).toContain("配置未確認 <strong>2台</strong>");
    expect(html).toMatch(/<section id="heatmap-unplaced"[^>]*hidden=""/);
    expect(html).toContain("9999番台、配置未確認、平均差枚（推定）+300枚、対象2日");
    expect(html).toContain("8888番台、配置未確認、履歴あり・差枚未集計、履歴2日");
    expect(html).toContain("場所は推定せず、この一覧に表示します");
    expect(html).toContain("差枚集計 7台日 / 島図 4台");
    const map = html.slice(html.indexOf("<main"));
    expect(map).not.toContain("9999");
    expect(map).not.toContain("8888");
  });

  it("retains floor names, provenance and an unconfirmed layout date in the help panel", () => {
    const labeled: FloorLayout = { ...floor, asOf: "配置基準日未記載", layoutNote: "配置が変わった台は一覧で確認してください。", labels: [{ text: "BF", x: 5, y: 5 }, { text: "2F", x: 80, y: 5 }] };
    const html = renderToStaticMarkup(<HeatmapClient data={data} floor={labeled} hallId="kabuki" />);
    expect(html).toContain('data-label="BF"');
    expect(html).toContain('data-label="2F"');
    expect(html).toContain('>BF</span>');
    expect(html).toContain('>2F</span>');
    expect(html).toContain("配置基準日未記載。入替前後も同じ台番号で集計。");
    expect(html).toContain(labeled.layoutNote);
    expect(html).toContain('href="https://example.test/floor.png" target="_blank" rel="noreferrer">配置図の出典</a>');
  });

  it("renders unit-only tiles including gray missing seats, a single date filter, and accessible details", () => {
    const html = renderToStaticMarkup(<HeatmapClient data={data} floor={floor} />);
    expect(html.match(/<select\b/g)).toHaveLength(1);
    expect(html.match(/<option\b/g)).toHaveLength(11);
    expect(html).toContain('value="all" selected=""');
    expect(html).toContain("1001番台、平均差枚（推定）+2,000枚、対象2日");
    expect(html).toContain("1004番台、平均差枚（推定）データなし");
    for (const seat of floor.seats) expect(html).toContain(`>${seat.unit}</button>`);
    expect(html).toContain("差枚あり 3台 · 未集計 0台 · 履歴なし 1台");
    expect(html).toContain("7台日");
    expect(html).toContain("設定狙いと同じ推定差枚");
    expect(html).toContain("100G以上・最終AT終了時に即やめ");
    expect(html).toContain("島図を拡大");
    expect(html).not.toContain("までの集計済みデータを表示");
  });

  it("identifies historical specific-day observations only when a snapshot is used", () => {
    const html = renderToStaticMarkup(<HeatmapClient data={{ ...data, snapshotFallbackTo: "2026-09-11" }} floor={floor} />);
    expect(html).toContain("特定日は一部の台で2026/09/11までの集計済みデータを表示しています。");
  });

  it("renders all seats as unknown when data has not been generated", () => {
    const html = renderToStaticMarkup(<HeatmapClient data={null} floor={floor} />);
    expect(html).toContain("集計データを準備中");
    expect(html).toContain("差枚あり 0台 · 未集計 0台 · 履歴なし 4台");
    expect(html).not.toContain("+2,000枚、対象");
    expect(html).toContain("1003番台、平均差枚（推定）データなし");
  });

  it("does not claim absent history when the added halls have no history coverage feed", () => {
    const html = renderToStaticMarkup(<HeatmapClient hallId="kabuki" data={{ ...data, hallId: "kabuki" }} floor={floor} />);
    expect(html).toContain("差枚あり 3台 · 未集計 0台 · 履歴未確認 1台");
    expect(html).toContain("この条件の差枚集計なし（履歴の有無は未確認）");
    expect(html).not.toContain("この条件の履歴なし");
  });

  it("does not call observed unmapped seats missing data", () => {
    const unmapped = { ...floor, seats: [{ ...floor.seats[0], unit: "9001" }] };
    const html = renderToStaticMarkup(<HeatmapClient hallId="akihabara" data={{ ...data, hallId: "akihabara" }} floor={unmapped} />);
    expect(html).toContain("配置図内の対象データはありません。配置未確認の一覧をご覧ください。");
    expect(html).not.toContain("この日付条件のデータはまだありません。");
    expect(html).toContain("配置未確認");
  });

  it("shows known history without inventing net values or mixing its days into the monetary total", () => {
    const withHistory: HeatmapData = { ...data, groups: data.groups.map((group) => group.key === "all" ? {
      ...group, pendingUnits: [{ unit: "1004", days: 3, firstDate: "2026-08-18", lastDate: "2026-08-21", reasons: ["獲得枚数を算出できません"] }],
    } : group) };
    expect(validateHeatmapData(withHistory)).toBe(withHistory);
    expect(heatmapGroupDateRange(withHistory.groups[0])).toEqual({ firstDate: "2026-08-18", lastDate: "2026-09-19" });
    const html = renderToStaticMarkup(<HeatmapClient data={withHistory} floor={floor} />);
    expect(html).toContain("差枚あり 3台 · 未集計 1台 · 履歴なし 0台");
    expect(html).toContain("差枚集計 7台日");
    expect(html).toContain("1004番台、履歴あり・差枚未集計、履歴3日、2026/08/18 〜 2026/08/21、獲得枚数を算出できません");
    expect(html).toContain(">1004</button>");
    expect(html).toContain(PENDING_HEAT_COLOR.background);
    expect(PENDING_HEAT_COLOR.background).not.toBe(heatColor(null).background);
    expect(PENDING_HEAT_COLOR.background).not.toBe(heatColor(0).background);
    expect(html).not.toContain("アナスロ");
    expect(html).not.toContain("ana-slo");
  });

  it("rejects invalid pending metadata and ambiguous merged counts", () => {
    const pending = { unit: "1004", days: 2, firstDate: "2026-09-11", lastDate: "2026-09-12", reasons: ["未集計"] };
    const altered = (row: object) => ({ ...data, groups: data.groups.map((group) => group.key === "all" ? { ...group, pendingUnits: [row] } : group) });
    expect(() => validateHeatmapData(altered({ ...pending, unit: "1001" }))).toThrow();
    expect(() => validateHeatmapData(altered({ ...pending, days: 3 }))).toThrow();
    expect(() => validateHeatmapData(altered({ ...pending, reasons: [] }))).toThrow();
    expect(() => validateHeatmapData(altered({ ...pending, days: null }))).toThrow();
    expect(() => validateHeatmapData(altered({ ...pending, days: null, overlappingPeriods: [
      { days: 1, firstDate: "2026-09-11", lastDate: "2026-09-11", reason: "未集計" },
      { days: 1, firstDate: "2026-09-12", lastDate: "2026-09-12", reason: "未集計" },
    ] }))).toThrow();
  });
});
