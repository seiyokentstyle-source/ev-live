import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { calcRow, computeAnchors, generateRows } from "../lib/ev/calc";
import { cashRtp, roundedRtp, rtpExplanation } from "../lib/ev/rtp";
import type { EvSamples, Machine, Profile, Theoretical } from "../lib/ev/types";
import { ConditionsBar } from "../components/ev/ConditionsBar";
import { EvTable } from "../components/ev/EvTable";
import { TheoreticalTable } from "../components/ev/TheoreticalTable";

const profile: Profile = {
  key: "normal_4652", label: "通常・46/52", ceiling: "1000G",
  gRange: { start: 0, end: 1000, step: 100 }, activeAxes: [], zones: [],
  baseAnchors: [
    { g: 0, ev: 240, rtp: 140, playG: 400, inv: 300, n: 50 },
    { g: 200, ev: 480, rtp: 200, playG: 200, inv: 100, n: 20 }
  ]
};
const machine: Machine = {
  id: "sample", name: "Sample", manufacturer: "X", aliases: [], thumb: null,
  available: true, releaseDate: "2025-01-01", lastUpdated: "2026-09-15",
  meta: { samples: "50", source: "synthetic" }, profiles: [profile], axes: [],
  modifiers: {}, creditValue: { "46": 1000 / 46, "50": 20 },
  economics: { medalsPerGame: 1.5, gamesPerHour: 800 },
  evCalc: { bet: 3, use: 1.5, junzou: 5, ceiling: 1000, step: 100 }
};

describe("cash-profit RTP for both rates", () => {
  it.each(["4652", "5050"])("%s uses the displayed session's EV and games, ignoring old RTP", (rate) => {
    const p = { ...profile, key: `normal_${rate}` };
    const row = calcRow(0, {}, p, machine);
    expect(row).toMatchObject({ ev: 240, rtp: 101, hourly: 480, medals: 300, n: 50 });
    const updated = { ...p, baseAnchors: p.baseAnchors.map(a => ({ ...a, rtp: 999 })) };
    expect(calcRow(0, {}, updated, machine)).toEqual(row);
  });

  it("divides interpolated EV by interpolated games, rather than interpolating either old or new RTP", () => {
    const row = calcRow(100, {}, profile, machine);
    // EV 360円・300G → 960円/時 → 102%。端の101%と104%の中間102.5%ではない。
    expect(row).toMatchObject({ ev: 360, rtp: 102, hourly: 960, medals: 200 });
    expect(row.n).toBeUndefined();
  });

  it("uses the selected precomputed filter's games, EV and sample count", () => {
    const filtered = {
      ...profile, baseAnchors: [{ g: 0, ev: -720, rtp: 85, playG: 400, inv: 321, n: 7 }]
    };
    expect(generateRows(filtered, machine, {})[0]).toMatchObject({
      ev: -720, rtp: 97, hourly: -1440, medals: 321, n: 7
    });
  });

  it("includes condition and credit adjustments in the same denominator as hourly EV", () => {
    const p = { ...profile, activeAxes: ["bonus", "credit"] };
    const m: Machine = { ...machine,
      axes: [
        { key: "bonus", label: "bonus", type: "select", pivotable: false, default: "on", options: [{ value: "on", label: "on" }] },
        { key: "credit", label: "credit", type: "number", pivotable: false, default: 0, min: 0, max: 100, step: 1 }
      ], modifiers: { bonus: { on: 240 } }
    };
    const row = calcRow(0, { credit: 12, rate: "50" }, p, m);
    expect(row).toMatchObject({ ev: 720, rtp: 103, hourly: 1440, medals: 300, n: 50 });
  });

  it("honors the machine bet and existing hourly speed without using its lending price", () => {
    const m = { ...machine, evCalc: { ...machine.evCalc!, bet: 2 }, economics: { ...machine.economics, gamesPerHour: 600 } };
    expect(calcRow(0, { rate: "46" }, profile, m)).toMatchObject({ ev: 240, rtp: 101.5, hourly: 360 });
    expect(rtpExplanation(600, 2)).toContain("1ポイント＝時給240円");
  });

  it("keeps the same remaining-G approximation for legacy data without playG", () => {
    const p = { ...profile, baseAnchors: [{ g: 0, ev: 600, rtp: 120 }] };
    expect(calcRow(0, {}, p, { ...machine, evCalc: undefined })).toMatchObject({ ev: 600, rtp: 101, hourly: 480 });
    expect(calcRow(1000, {}, p, machine)).toMatchObject({ rtp: 100, hourly: 0, noData: true });
  });

  it("does not invent remaining games for explicit zero duration", () => {
    const p = { ...profile, baseAnchors: [{ g: 0, ev: -100, rtp: 90, playG: 0 }] };
    expect(calcRow(0, {}, p, machine)).toMatchObject({ rtp: 100, hourly: 0 });
    expect(cashRtp(100, 0)).toBe(100);
  });

  it("keeps loss-side display rounding below 100%", () => {
    expect(roundedRtp(cashRtp(-1, 400))).toBe(99.9);
    expect(roundedRtp(cashRtp(1, 400))).toBe(100);
    expect(roundedRtp(100)).toBe(100);
  });

  it("does not propagate nonfinite profit or duration into a percentage", () => {
    expect(cashRtp(Number.NaN, 400)).toBe(100);
    expect(cashRtp(Number.POSITIVE_INFINITY, 400)).toBe(100);
    expect(cashRtp(100, Number.POSITIVE_INFINITY)).toBe(100);
  });

  it.each([false, true])("client-side aggregation preserves EV, games, investment and samples (AT model=%s)", (at) => {
    const hits: EvSamples["hits"] = at
      ? [["1", "2026-09-15", 100, 300, 0, 150]]
      : [["1", "2026-09-15", 100, 300]];
    const cens: EvSamples["cens"] = at ? [] : [["2", "2026-09-15", 50]];
    const anchors = computeAnchors(hits, cens, machine.evCalc!, 1000 / 46, 1000 / 52, 1);
    const a = anchors[0];
    const n = at ? 1 : 2;
    const ev = Math.round((300 * 1000 / 52 - 225 * 1000 / 46) / n);
    const playG = Math.round((150 + 300 / 5) / n);
    expect(a).toMatchObject({ ev, playG, inv: Math.round(225 / n), n });
    expect(a.rtp).toBe(Math.round((100 + ev / (60 * playG) * 100) * 10) / 10);
  });
});

describe("RTP presentation", () => {
  it("identifies the 46/52 cash conversion in the table header", () => {
    const html = renderToStaticMarkup(<EvTable machine={machine} profile={profile} rows={generateRows(profile, machine, {})} onViewGChange={() => {}} />);
    expect(html).toContain("換算機械割");
    expect(html).toContain("101.0");
    expect(html).not.toContain("140.0");
  });

  it("replaces an old calculation description without waiting for new JSON", () => {
    const m = { ...machine, calcSpec: { items: [{ k: "機械割", v: "回収円÷投資円" }] } };
    const html = renderToStaticMarkup(<ConditionsBar machine={m} mode="ev" />);
    expect(html).toContain("1ポイント＝時給480円");
    expect(html).toContain("換算機械割");
    expect(html).not.toContain("回収円÷投資円");
  });

  it("leaves setting-aim OUT/IN unchanged", () => {
    const html = renderToStaticMarkup(<ConditionsBar machine={machine} mode="setting" />);
    expect(html).toContain("OUT÷IN");
    expect(html).not.toContain("換算機械割");
  });

  it("uses recalculated theory values for both the table and its 106% border, preserving official spec RTP", () => {
    const data: Theoretical = {
      label: "設定1想定", source: "synthetic", firstHitG: 300, avgPayout: 500,
      specFirstHitG: 350, specRtp: 97.6, ceiling: 1000,
      note: "獲得の補正は維持。※等価タブの機械割はOUT÷INなので直接比べられる。46/52タブは回収円÷投資円なので公表値より低く出る。",
      gRange: { start: 0, end: 200, step: 100 },
      baseAnchors: [
        { g: 0, ev: 1200, rtp: 107, playG: 400 },
        { g: 100, ev: 1500, rtp: 108, playG: 400 },
        { g: 200, ev: 1800, rtp: 109, playG: 400 }
      ]
    };
    const html = renderToStaticMarkup(<TheoreticalTable data={data} gamesPerHour={800} />);
    expect(html).toContain(">100G〜<");
    expect(html).toContain("105.0");
    expect(html).toContain("106.3");
    expect(html).toContain("107.5");
    expect(html).toContain("97.6%");
    expect(html).toContain("獲得の補正は維持。");
    expect(html).not.toContain("回収円÷投資円");
    expect(data.baseAnchors[0].rtp).toBe(107);
    expect(data.specRtp).toBe(97.6);
  });
});
