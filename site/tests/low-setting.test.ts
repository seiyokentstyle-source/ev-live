import { describe, expect, it } from "vitest";
import { onlyLowSetting, withoutLowSetting } from "../lib/ev/low-setting";
import type { Machine, Profile } from "../lib/ev/types";

function profile(label: string, key = label): Profile {
  return {
    key,
    label,
    ceiling: "",
    gRange: { start: 0, end: 100, step: 10 },
    activeAxes: [],
    baseAnchors: [],
    zones: []
  };
}

function machine(profiles: Profile[], extra: Partial<Machine> = {}): Machine {
  return {
    id: "vvv2",
    name: "スマスロ 革命機ヴァルヴレイヴ2",
    manufacturer: "SANKYO",
    aliases: [],
    thumb: null,
    available: true,
    releaseDate: "2025-01-01",
    lastUpdated: "2026-09-13",
    meta: { samples: "", source: "" },
    profiles,
    axes: [],
    modifiers: {},
    creditValue: {},
    economics: { medalsPerGame: 1.5, gamesPerHour: 800 },
    ...extra
  } as Machine;
}

const REAL = profile("AT・RB間天井（通常）・46/52");
const EST = profile("CZ間天井（設定1想定・CZ1回でやめ）・46/52");
const THEORY = { label: "設定1想定", baseAnchors: [] } as Machine["theoretical"];

describe("店舗別の表示（withoutLowSetting）", () => {
  it("設定1想定の表と理論表を外す", () => {
    const out = withoutLowSetting(machine([REAL, EST], { theoretical: THEORY }));
    expect(out.profiles.map((p) => p.label)).toEqual([REAL.label]);
    expect(out.theoretical).toBeUndefined();
  });

  it("推定が無い機種はそのまま返す", () => {
    const input = machine([REAL]);
    expect(withoutLowSetting(input)).toBe(input);
  });

  it("全部が推定なら profile は外さない（空にすると機種ページが消える）", () => {
    const out = withoutLowSetting(machine([EST], { theoretical: THEORY }));
    expect(out.profiles.map((p) => p.label)).toEqual([EST.label]);
    expect(out.theoretical).toBeUndefined();
  });

  it("元のオブジェクトを書き換えない", () => {
    const input = machine([REAL, EST], { theoretical: THEORY });
    withoutLowSetting(input);
    expect(input.profiles).toHaveLength(2);
    expect(input.theoretical).toBeDefined();
  });
});

describe("低設定想定店舗混合の表示（onlyLowSetting）", () => {
  it("設定1想定の表だけを残す", () => {
    const out = onlyLowSetting(machine([REAL, EST], { theoretical: THEORY }));
    expect(out?.profiles.map((p) => p.label)).toEqual([EST.label]);
    expect(out?.theoretical).toBeDefined();
  });

  it("実測でしか出せないものは持って行かない", () => {
    const out = onlyLowSetting(
      machine([REAL, EST], {
        settingAim: { units: [], dates: [] } as unknown as Machine["settingAim"],
        atPayout: {} as Machine["atPayout"],
        harakiri: {} as Machine["harakiri"],
        savedTargets: [] as Machine["savedTargets"]
      })
    );
    expect(out?.settingAim).toBeUndefined();
    expect(out?.atPayout).toBeUndefined();
    expect(out?.harakiri).toBeUndefined();
    expect(out?.savedTargets).toBeUndefined();
  });

  it("設定1想定が無い機種は一覧に出さない", () => {
    expect(onlyLowSetting(machine([REAL]))).toBeNull();
  });

  it("理論表しか無い機種も出さない（profiles が空だと描画できない）", () => {
    expect(onlyLowSetting(machine([REAL], { theoretical: THEORY }))).toBeNull();
  });
});
