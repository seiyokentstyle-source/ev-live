import { aimIntervalBase, aimTabLabel, aimTabRank, ceilingHint, resetAimLabel, resetCeilingHint, type ProfileGroup } from "./profiles";

const TARGET_PREFIX = "saved-target:";

export function savedTargetAimKey(id: string): string { return `${TARGET_PREFIX}${id}`; }

/** 掲載中のIDだけを受け付ける。解除済みの狙い目を復活させない。 */
export function savedTargetIdFromAim(key: string, targets: Array<{ id: string }>): string | null {
  if (!key.startsWith(TARGET_PREFIX)) return null;
  const id = key.slice(TARGET_PREFIX.length);
  return targets.some(target => target.id === id) ? id : null;
}

function isResetGroup(key: string): boolean {
  return key === "reset";
}

export function aimTabs(groups: ProfileGroup[], targets: Array<{ id: string; name: string; rate: string }>) {
  // リセットの表の区切りは主表（通常時の AT間・ボナ間など）と同じ。見出しと天井をそこから補う。
  const main = groups.find(group => group.key === "game_ceiling")
    ?? groups.find(group => aimTabRank(group.key) === 0);
  const mainBase = main ? aimIntervalBase(main) : "";
  const mainHint = main ? ceilingHint(main.ceiling) : "";
  return [
    ...groups.map(group => isResetGroup(group.key)
      ? { key: group.key, label: resetAimLabel(aimTabLabel(group), mainBase), ceiling: group.ceiling,
          hint: resetCeilingHint(group.order[0]?.ceiling ?? group.ceiling, mainHint) }
      : { key: group.key, label: aimTabLabel(group), ceiling: group.ceiling }),
    ...targets.map(target => ({ key: savedTargetAimKey(target.id), label: target.name,
      ceiling: `保存した狙い目・${target.rate}` }))
  ];
}
