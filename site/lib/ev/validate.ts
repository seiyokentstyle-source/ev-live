import type { Axis, Machine, SelectAxis } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid machine data: ${message}`);
  }
}

function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isSafeThumb(value: string): boolean {
  // Allow root-relative paths and explicit http(s) URLs only. This rejects
  // dangerous schemes such as javascript:, data:, and vbscript: that could be
  // smuggled into an <img src>/link if machine data ever comes from an untrusted
  // source.
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getSelectAxis(axis: Axis): SelectAxis | undefined {
  return axis.type === "select" ? axis : undefined;
}

export function validateMachine(data: unknown): Machine {
  assert(isRecord(data), "root must be an object");
  const machine = data as Machine;

  assert(typeof machine.id === "string" && machine.id.length > 0, "id is required");
  assert(typeof machine.name === "string" && machine.name.length > 0, "name is required");
  assert(typeof machine.manufacturer === "string" && machine.manufacturer.length > 0, "manufacturer is required");
  assert(Array.isArray(machine.aliases) && machine.aliases.every((alias) => typeof alias === "string"), "aliases must be string[]");
  assert(typeof machine.available === "boolean", "available must be boolean");
  assert(
    machine.thumb === null || (typeof machine.thumb === "string" && isSafeThumb(machine.thumb)),
    "thumb must be null or a safe http(s)/root-relative URL"
  );
  assert(typeof machine.releaseDate === "string" && isDateString(machine.releaseDate), "releaseDate must be YYYY-MM-DD");
  assert(typeof machine.lastUpdated === "string" && isDateString(machine.lastUpdated), "lastUpdated must be YYYY-MM-DD");
  assert(Array.isArray(machine.profiles) && machine.profiles.length > 0, "profiles are required");
  assert(Array.isArray(machine.axes) && machine.axes.length > 0, "axes are required");
  assert(isRecord(machine.modifiers), "modifiers are required");
  assert(isRecord(machine.creditValue), "creditValue is required");
  assert(isRecord(machine.economics), "economics are required");
  assert(machine.economics.medalsPerGame > 0, "medalsPerGame must be > 0");
  assert(machine.economics.gamesPerHour > 0, "gamesPerHour must be > 0");
  for (const [rateKey, value] of Object.entries(machine.creditValue)) {
    assert(typeof value === "number" && Number.isFinite(value), `creditValue ${rateKey} must be a finite number`);
  }

  const axisKeys = new Set(machine.axes.map((axis) => axis.key));
  assert(axisKeys.size === machine.axes.length, "axis keys must be unique");

  for (const axis of machine.axes) {
    assert(typeof axis.key === "string" && axis.key.length > 0, "axis key is required");
    assert(typeof axis.label === "string" && axis.label.length > 0, `axis ${axis.key} label is required`);
    if (axis.type === "select") {
      assert(Array.isArray(axis.options) && axis.options.length > 0, `axis ${axis.key} options are required`);
      const optionValues = new Set(axis.options.map((option) => option.value));
      assert(optionValues.has(axis.default), `axis ${axis.key} default must exist in options`);
    } else {
      assert(Number.isFinite(axis.default), `axis ${axis.key} default must be numeric`);
      assert(axis.min <= axis.default && axis.default <= axis.max, `axis ${axis.key} default is out of range`);
    }
  }

  for (const profile of machine.profiles) {
    assert(profile.gRange.step > 0, `profile ${profile.key} step must be > 0`);
    for (const key of profile.activeAxes) {
      assert(axisKeys.has(key), `profile ${profile.key} references unknown axis ${key}`);
    }
    assert(Array.isArray(profile.baseAnchors), `profile ${profile.key} baseAnchors must be an array`);
    assert(Array.isArray(profile.zones), `profile ${profile.key} zones must be an array`);

    // A data-pending profile has no 実戦 data yet: the tab is shown but no table is
    // rendered, so the anchor/zone constraints below do not apply.
    if (profile.dataPending) continue;

    assert(profile.baseAnchors.length >= 2, `profile ${profile.key} must have at least two anchors`);
    for (let i = 0; i < profile.baseAnchors.length; i += 1) {
      const anchor = profile.baseAnchors[i];
      assert(anchor.g >= profile.gRange.start && anchor.g <= profile.gRange.end, `anchor ${anchor.g} is out of range`);
      assert((anchor.rtp >= 100) === (anchor.ev >= 0), `anchor ${anchor.g} EV/RTP sign mismatch`);
      // Sample size is optional (older data omits it); when present it must be a non-negative number.
      assert(
        anchor.n === undefined || (typeof anchor.n === "number" && Number.isFinite(anchor.n) && anchor.n >= 0),
        `anchor ${anchor.g} n must be a non-negative number`
      );
      if (i > 0) {
        assert(anchor.g > profile.baseAnchors[i - 1].g, `anchors must be sorted for ${profile.key}`);
      }
    }
    for (const zone of profile.zones) {
      assert(zone.g >= profile.gRange.start && zone.g <= profile.gRange.end, `zone ${zone.g} is out of range`);
    }
  }

  for (const [axisKey, modifiers] of Object.entries(machine.modifiers)) {
    assert(axisKeys.has(axisKey), `modifier references unknown axis ${axisKey}`);
    const axis = getSelectAxis(machine.axes.find((candidate) => candidate.key === axisKey) as Axis);
    if (!axis) continue;
    const options = new Set(axis.options.map((option) => option.value));
    for (const optionValue of Object.keys(modifiers)) {
      assert(options.has(optionValue), `modifier ${axisKey}.${optionValue} references unknown option`);
    }
  }

  // 設定狙いデータは任意（対応機種のみ・古いデータには無い）。あるときだけ形を検証する。
  if (machine.settingAim !== undefined) {
    const aim = machine.settingAim;
    assert(isRecord(aim), "settingAim must be an object");
    assert(typeof aim.label === "string", "settingAim.label must be a string");
    assert(typeof aim.unit === "string", "settingAim.unit must be a string");
    assert(typeof aim.note === "string", "settingAim.note must be a string");
    assert(Array.isArray(aim.dates) && aim.dates.every((d) => typeof d === "string"), "settingAim.dates must be string[]");
    assert(Array.isArray(aim.units), "settingAim.units must be an array");
    for (const unit of aim.units) {
      assert(typeof unit.unit === "string" && unit.unit.length > 0, "settingAim unit id is required");
      assert(typeof unit.avg === "number" && Number.isFinite(unit.avg), `settingAim ${unit.unit} avg must be a finite number`);
      assert(typeof unit.days === "number" && unit.days >= 0, `settingAim ${unit.unit} days must be >= 0`);
      assert(typeof unit.net === "number" && Number.isFinite(unit.net), `settingAim ${unit.unit} net must be a finite number`);
      assert(
        Array.isArray(unit.rates) && unit.rates.length === aim.dates.length,
        `settingAim ${unit.unit} rates must align with dates`
      );
      assert(
        unit.rates.every((r) => r === null || (typeof r === "number" && Number.isFinite(r))),
        `settingAim ${unit.unit} rates must be number or null`
      );
      // games（日別総回転数）は任意。あるときだけ dates と同じ長さ・非負数であることを確認する。
      if (unit.games !== undefined) {
        assert(
          Array.isArray(unit.games) && unit.games.length === aim.dates.length,
          `settingAim ${unit.unit} games must align with dates`
        );
        assert(
          unit.games.every((g) => typeof g === "number" && Number.isFinite(g) && g >= 0),
          `settingAim ${unit.unit} games must be non-negative numbers`
        );
      }
    }
  }

  // AT獲得データは任意（対応機種のみ）。あるときだけ形を検証する。
  if (machine.atPayout !== undefined) {
    const ap = machine.atPayout;
    assert(isRecord(ap), "atPayout must be an object");
    assert(typeof ap.step === "number" && ap.step > 0, "atPayout.step must be > 0");
    assert(typeof ap.label === "string", "atPayout.label must be a string");
    assert(typeof ap.note === "string", "atPayout.note must be a string");
    assert(Array.isArray(ap.bands) && ap.bands.length > 0, "atPayout.bands must be a non-empty array");
    for (const band of ap.bands) {
      assert(typeof band.lo === "number" && typeof band.hi === "number" && band.hi > band.lo, `atPayout band ${band.lo} range is invalid`);
      assert(typeof band.count === "number" && band.count >= 0, `atPayout band ${band.lo} count must be >= 0`);
      assert(typeof band.mean === "number" && Number.isFinite(band.mean), `atPayout band ${band.lo} mean must be finite`);
      assert(typeof band.median === "number" && Number.isFinite(band.median), `atPayout band ${band.lo} median must be finite`);
    }
  }

  const rateAxis = machine.axes.find((axis) => axis.key === "rate");
  assert(rateAxis?.type === "select", "rate axis must be a select axis");
  for (const option of rateAxis.options) {
    assert(typeof machine.creditValue[option.value] === "number", `creditValue missing ${option.value}`);
  }

  return machine;
}
