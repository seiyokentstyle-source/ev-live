import fixture from "../../app/preview/ev-table/machine.json";
import { validateMachine } from "../../lib/ev/validate";
import type { Machine } from "../../lib/ev/types";

/** Synthetic distinct hall/profile amounts; no store's observed rows are copied. */
export function assumedPayoutFixture(id = "m407111cd", hall = "shinjuku", value = 100): Machine {
  const base = structuredClone(fixture);
  const name = id === "mfb4da289" ? "ソードアート・オンラインII" : "L魔法少女にあこがれて";
  const profiles = ["game_ceiling_4652", "reset_4652", "game_ceiling_5050", "reset_5050"].map((key, index) => {
    const { ev: _samples, ...profile } = structuredClone(base.profiles[0]);
    return { ...profile, key, label: `${key.startsWith("reset") ? "朝一（リセット想定・実測）" : "天井（通常・実測）"}・${key.endsWith("4652") ? "46/52" : "50/50"}`,
      sessions: value + index, baseAnchors: profile.baseAnchors.map(anchor => ({ ...anchor, ev: value + index, rtp: 110 })) };
  });
  return validateMachine({ ...base, id, name, aliases: [name], lastUpdated: "2026-10-21",
    meta: { samples: String(value * 2), source: `${hall}の当選G分布` }, profiles,
    calcSpec: { items: [
      { k: "設定1（公表）機械割", v: "97.6%から獲得を逆算した単店モデル" },
      { k: "★獲得は実測ではない", v: "公表設定1機械割から逆算した定数獲得" },
      { k: "設定1想定の補正", v: "別の設定1補正表の説明" },
    ] } });
}
