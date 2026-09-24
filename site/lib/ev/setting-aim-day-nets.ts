import type { SettingAimDayDigit } from "./types";

export const SETTING_AIM_DAY_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function settingAimDateDigits(date: string): SettingAimDayDigit[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid machine data: settingAim date must be YYYY-MM-DD: ${date}`);
  }
  return [...new Set(String(Number(date.slice(-2))))] as SettingAimDayDigit[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** An omitted map is an old payload; a supplied map must cover its valid dates. */
export function validateSettingAimDayDigitNets(value: unknown, observedDates: readonly string[], unit: string): void {
  if (value === undefined) return;
  const fail = (reason: string): never => { throw new Error(`Invalid machine data: settingAim ${unit} dayDigitNets ${reason}`); };
  if (!record(value)) return fail("must be an object");
  const daysByDigit = new Map<SettingAimDayDigit, number>();
  for (const date of observedDates) {
    for (const digit of settingAimDateDigits(date)) daysByDigit.set(digit, (daysByDigit.get(digit) ?? 0) + 1);
  }
  for (const [digit, aggregate] of Object.entries(value)) {
    if (!SETTING_AIM_DAY_DIGITS.includes(digit as SettingAimDayDigit)) return fail("contains an unknown day digit");
    if (!record(aggregate) || !Number.isSafeInteger(aggregate.net) || !Number.isSafeInteger(aggregate.days) || (aggregate.days as number) <= 0) {
      return fail(`${digit} must have integer net and positive integer days`);
    }
    if (aggregate.days !== daysByDigit.get(digit as SettingAimDayDigit)) return fail(`${digit} days must match rates`);
  }
  for (const digit of daysByDigit.keys()) {
    if (!Object.hasOwn(value, digit)) return fail(`must include observed day digit ${digit}`);
  }
}
