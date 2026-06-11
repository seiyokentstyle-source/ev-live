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

  const rateAxis = machine.axes.find((axis) => axis.key === "rate");
  assert(rateAxis?.type === "select", "rate axis must be a select axis");
  for (const option of rateAxis.options) {
    assert(typeof machine.creditValue[option.value] === "number", `creditValue missing ${option.value}`);
  }

  return machine;
}
