import { describe, expect, it } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { displayMachineName, rewriteManufacturer } from "../lib/ev/profiles";
import { validateMachine } from "../lib/ev/validate";
import type { Machine } from "../lib/ev/types";
import { machineSelectionKey, sameMachineSelection } from "../lib/machine-identity";
import { withCurrentCollection } from "../lib/machines";
import { collectedFixture } from "./fixtures/collection-status";

describe("display names", () => {
  it("turns only half-width kana into full-width and leaves every other name as it is", () => {
    expect(displayMachineName("Lｺﾞｼﾞﾗ対ｴｳﾞｧﾝｹﾞﾘｵﾝ2")).toBe("Lゴジラ対エヴァンゲリオン2");
    expect(displayMachineName("Lｶﾞﾝｹﾞｲﾙ･ｵﾝﾗｲﾝ")).toBe("Lガンゲイル・オンライン");
    expect(displayMachineName("Lﾗｸﾞﾅﾄﾞｰﾙ")).toBe("Lラグナドール");
    for (const name of ["L ＨＥＹ！エリートサラリーマン鏡", "スマスロ 東京リベンジャーズ(リベスロ)", "Lパチスロ　ガールズ＆パンツァー最終章", "L Vivy", "沖ドキ！BLACK"]) {
      expect(displayMachineName(name)).toBe(name);
    }
  });
});

describe("manufacturers for machines the data still calls 未登録", () => {
  it.each([
    ["スマスロ 獣王", "Sammy"], ["L獣王", "Sammy"], ["L魔法少女にあこがれて", "ニューギン"],
    ["L転生王女と天才令嬢の魔法革命", "オリンピアエステート"], ["Lバンドリ！", "オリンピアエステート"],
    ["スマスロパリピ孔明", "山佐ネクスト"], ["Lパリピ孔明", "山佐ネクスト"],
    ["パチスロ　戦姫絶唱シンフォギア　勇気の歌", "SANKYO"], ["スロット Re:ゼロから始める異世界生活 Season2", "大都技研"],
  ])("%s → %s", (name, maker) => {
    expect(rewriteManufacturer(name, "未登録")).toBe(maker);
    expect(rewriteManufacturer(name, "データの値")).toBe("データの値");
  });
});

describe("same machine under two source names", () => {
  it("groups the Site Seven spellings with the registered names", () => {
    const pairs = [
      [{ id: "me5b967bb", name: "Lパチスロガールズ＆パンツァー 最終章" }, { id: "mb4736276", name: "Lパチスロ　ガールズ＆パンツァー最終章" }],
    ];
    for (const [main, other] of pairs) {
      expect(sameMachineSelection(main, other)).toBe(true);
      expect(machineSelectionKey(other)).toBe("group:" + main.id);
      expect(sameMachineSelection(main, { ...other, name: "別の名前" })).toBe(false);
    }
  });
});

describe("different machines with similar names", () => {
  it("keeps the first ToLOVEる Darkness apart from TRANCE ver.8.7", () => {
    const first = { id: "m25a41de5", name: "L Ｔｏ　ＬＯＶＥるダークネス" };
    const trance = { id: "m1b2c9466", name: "LToLOVEるダークネス TRANCE ver.8.7" };
    expect(sameMachineSelection(first, trance)).toBe(false);
    expect(machineSelectionKey(first)).not.toBe(machineSelectionKey(trance));
  });
});

describe("saved-history counts of a held machine", () => {
  const pending = (): Machine => {
    const machine = validateMachine(structuredClone(fixture));
    const saved = collectedFixture("held");
    return { ...machine, id: saved.summary.id, name: saved.summary.name, lastUpdated: "2026-09-26",
      meta: { ...machine.meta, samples: "0", collection: { ...saved.summary.meta.collection! } },
      profiles: [{ ...machine.profiles[0], key: "counter_pending", baseAnchors: [], dataPending: true, pendingReason: "保留" }] };
  };
  const newer = (patch: object = {}) => {
    const entry = collectedFixture("held");
    entry.summary.lastUpdated = "2026-10-10";
    entry.summary.meta.collection = { rows: 2000, events: 1900, units: 2, days: 10, firstDate: "2026-09-23", lastDate: "2026-10-10", ...patch };
    return [{ ...entry, forcePending: false }];
  };

  it("follows the newer collection status and changes nothing else", () => {
    const machine = pending(), next = withCurrentCollection(machine, newer());
    expect(next.meta.collection).toEqual(newer()[0].summary.meta.collection);
    expect(next.lastUpdated).toBe("2026-10-10");
    const { meta: _a, lastUpdated: _b, ...rest } = next, { meta: _c, lastUpdated: _d, ...before } = machine;
    expect(rest).toEqual(before);
    expect({ ...next.meta, collection: undefined }).toEqual({ ...machine.meta, collection: undefined });
  });

  it("keeps the machine as it is when the status is not newer, shrinks, or is another machine", () => {
    const machine = pending();
    expect(withCurrentCollection(machine, [])).toBe(machine);
    expect(withCurrentCollection(machine, newer({ lastDate: "2026-09-26" }))).toBe(machine);
    expect(withCurrentCollection(machine, newer({ rows: 10, events: 5 }))).toBe(machine);
    expect(withCurrentCollection(machine, newer({ firstDate: "2026-10-01" }))).toBe(machine);
    const other = newer(); other[0].summary.name = "別の名前";
    expect(withCurrentCollection(machine, other)).toBe(machine);
  });

  it("never touches a machine that has a numerical table", () => {
    const machine = validateMachine(structuredClone(fixture));
    const entry = newer(); entry[0].summary.id = machine.id; entry[0].summary.name = machine.name;
    expect(withCurrentCollection(machine, entry)).toBe(machine);
    const numeric = { ...pending(), meta: { ...pending().meta, samples: "120" } };
    expect(withCurrentCollection(numeric, newer())).toBe(numeric);
  });
});
