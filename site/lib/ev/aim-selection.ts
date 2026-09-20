import type { ProfileGroup } from "./profiles";

const TARGET_PREFIX = "saved-target:";

export function savedTargetAimKey(id: string): string { return `${TARGET_PREFIX}${id}`; }

/** 掲載中のIDだけを受け付ける。解除済みの狙い目を復活させない。 */
export function savedTargetIdFromAim(key: string, targets: Array<{ id: string }>): string | null {
  if (!key.startsWith(TARGET_PREFIX)) return null;
  const id = key.slice(TARGET_PREFIX.length);
  return targets.some(target => target.id === id) ? id : null;
}

export function aimTabs(groups: ProfileGroup[], targets: Array<{ id: string; name: string; rate: string }>) {
  return [
    ...groups.map(group => ({ key: group.key, label: group.label, ceiling: group.ceiling })),
    ...targets.map(target => ({ key: savedTargetAimKey(target.id), label: target.name,
      ceiling: `保存した狙い目・${target.rate}` }))
  ];
}
