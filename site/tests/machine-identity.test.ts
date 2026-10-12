import { describe, expect, it } from "vitest";
import { machineRouteIds, machineSelectionKey, matchesMachineRoute, sameMachineSelection } from "../lib/machine-identity";
import { findMachineHallSummary, selectMachineListSummaries } from "../lib/machine-list-summary";
import { isMachineFavorite, toggleMachineFavorite } from "../lib/favorites";
import { collectedFixture } from "./fixtures/collection-status";

const pairs = [
  ["m4ab6796b", "Lパリピ孔明", "m020bda5f", "スマスロパリピ孔明"],
  ["m2bcf2c11", "L獣王", "m8a798229", "スマスロ 獣王"],
  ["m04a5dfa2", "Lモンスターハンターライズ：サンブレイク", "mebc58d07", "スマスロ モンスターハンターライズ：サンブレイク"],
];

describe("exact display identities", () => {
  it.each(pairs)("groups %s with its verified second name without changing either payload", (oldId, oldName, id, name) => {
    const old = { ...collectedFixture(oldId).summary, name: oldName };
    const current = { ...collectedFixture(id).summary, name, meta: { samples: "80", source: "歌舞伎" } };
    const mixed = { ...current, meta: { samples: "302", source: "店舗混合" } };
    const entries = [
      { hallId: "shinjuku", summary: old }, { hallId: "kabuki", summary: current },
      { hallId: "mixed-raw", summary: mixed }, { hallId: "mixed-raw", summary: old },
      { hallId: "mixed", summary: mixed },
    ];
    const before = structuredClone(entries);
    const selected = selectMachineListSummaries(entries);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ id, totalSamples: 302, summaryHallId: "kabuki", meta: { samples: "80" } });
    expect(selected[0].aliases).toContain(oldName);
    expect(findMachineHallSummary(entries, old, "kabuki")?.summary).toEqual(current);
    expect(findMachineHallSummary(entries, current, "shinjuku")?.summary).toEqual(old);
    expect(findMachineHallSummary(entries, old, "mixed-raw")?.summary).toEqual(mixed);
    expect(entries).toEqual(before);
    expect(machineRouteIds(oldId)).toEqual([oldId, id]);
    expect(machineRouteIds(id)).toEqual([id, oldId]);
    expect(sameMachineSelection(old, current)).toBe(true);
    expect(matchesMachineRoute(oldId, current)).toBe(true);
    expect(matchesMachineRoute(id, { ...old, name: `${oldName}II` })).toBe(false);
    const wrong = { ...current, name: `${name}II` };
    expect(machineSelectionKey(old)).not.toBe(machineSelectionKey(wrong));
    expect(selectMachineListSummaries([{ hallId: "shinjuku", summary: old }, { hallId: "kabuki", summary: wrong }])).toHaveLength(2);

    const favorites = { [oldId]: true, [id]: true, unrelated: true };
    expect(isMachineFavorite(current, favorites)).toBe(true);
    expect(toggleMachineFavorite(current, favorites)).toEqual({ unrelated: true });
    const toggled = toggleMachineFavorite(old, { unrelated: true });
    expect(toggled).toEqual({ unrelated: true, [id]: true });
    expect(isMachineFavorite(current, toggled)).toBe(true);
    expect(favorites).toEqual({ [oldId]: true, [id]: true, unrelated: true });
  });

  it("never groups sequels or an arbitrary matching name", () => {
    expect(sameMachineSelection({ id: "m49d497e0", name: "Lソードアート・オンライン" },
      { id: "mfb4da289", name: "ソードアート・オンラインII" })).toBe(false);
    expect(sameMachineSelection({ id: "unregistered", name: "Lパリピ孔明" },
      { id: "m020bda5f", name: "スマスロパリピ孔明" })).toBe(false);
  });

  it("joins the verified Tokyo Revengers names while retaining collection-only status", () => {
    const old = { ...collectedFixture("m39a9f4f4").summary, name: "スマスロ 東京リベンジャーズ(リベスロ)" };
    const current = { ...collectedFixture("m50246ef0").summary, name: "スマスロ 東京リベンジャーズ" };
    const selected = selectMachineListSummaries([
      { hallId: "shinjuku", summary: old }, { hallId: "kabuki", summary: current },
    ]);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ id: current.id, totalSamples: 0, meta: { samples: "0", collection: current.meta.collection } });
    expect(matchesMachineRoute(old.id, current)).toBe(true);
    expect(matchesMachineRoute(current.id, old)).toBe(true);
  });

  it("keeps a possible explicit hold in a cached real-hall index without blocking mixed data", () => {
    const old = { ...collectedFixture("m4ab6796b").summary, name: "Lパリピ孔明" };
    const current = { ...collectedFixture("m020bda5f").summary, name: "スマスロパリピ孔明", meta: { samples: "302", source: "実測" } };
    for (const entries of [[old, current], [current, old]]) {
      expect(findMachineHallSummary(entries.map(summary => ({ hallId: "shinjuku", summary })), current, "shinjuku")?.summary).toEqual(old);
      expect(findMachineHallSummary(entries.map(summary => ({ hallId: "mixed-raw", summary })), old, "mixed-raw")?.summary).toEqual(current);
    }
  });
});
