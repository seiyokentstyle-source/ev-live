import type { Axis, Machine, SelectAxis } from "./types";
import { isExactFilterTableKey } from "./profiles";
import { validateAggregateMatchModes, validateAggregateRows } from "./filter-aggregation-validation";
import { validateAggregationRowsAsset } from "./aggregation-asset";

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
  // Explorer envelopes are delivered separately. Saved-target refreshes are
  // selected server-side against current publication membership, so detached
  // entries must not linger in the public Machine/React payload either.
  const { intervalExplorer: _privateExplorer, savedTargets: _savedTargets, ...publicData } = data;
  const machine = publicData as Machine;

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
  if (machine.mixedSources !== undefined) {
    const mixed = machine.mixedSources;
    assert(isRecord(mixed) && mixed.schemaVersion === 1, "invalid mixedSources schema");
    assert(Array.isArray(mixed.halls) && mixed.halls.length > 0
      && mixed.halls.every((hall) => typeof hall === "string" && /^[a-z0-9_-]+$/.test(hall) && hall !== "mixed")
      && new Set(mixed.halls).size === mixed.halls.length, "invalid mixedSources halls");
    assert(typeof mixed.inputSha256 === "string" && /^[a-f0-9]{64}$/.test(mixed.inputSha256), "invalid mixedSources hash");
  }
  if (machine.meta?.collection !== undefined) {
    const collection = machine.meta.collection;
    assert(isRecord(collection), "meta.collection must be an object");
    for (const key of ["rows", "events", "units", "days"] as const) {
      assert(Number.isSafeInteger(collection[key]) && collection[key] >= 0, `meta.collection.${key} must be a non-negative integer`);
    }
    assert(collection.events <= collection.rows, "meta.collection.events must not exceed rows");
    assert(typeof collection.firstDate === "string" && isDateString(collection.firstDate), "meta.collection.firstDate must be YYYY-MM-DD");
    assert(typeof collection.lastDate === "string" && isDateString(collection.lastDate), "meta.collection.lastDate must be YYYY-MM-DD");
    assert(collection.firstDate <= collection.lastDate, "meta.collection date range must be ordered");
  }
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
    assert(profile.aimKind === undefined || ["cz", "bonus", "at_non_runthrough", "at_runthrough"].includes(profile.aimKind),
      `profile ${profile.key} aimKind is invalid`);
    assert(profile.gRange.step > 0, `profile ${profile.key} step must be > 0`);
    for (const key of profile.activeAxes) {
      assert(axisKeys.has(key), `profile ${profile.key} references unknown axis ${key}`);
    }
    assert(Array.isArray(profile.baseAnchors), `profile ${profile.key} baseAnchors must be an array`);
    assert(Array.isArray(profile.zones), `profile ${profile.key} zones must be an array`);
    assert(profile.pendingReason === undefined || typeof profile.pendingReason === "string", `profile ${profile.key} pendingReason must be a string`);

    if (profile.evFilters !== undefined) {
      const filters = profile.evFilters;
      assert(isRecord(filters) && isRecord(filters.tables), `profile ${profile.key} evFilters.tables must be an object`);
      assert(filters.selectionPolicy === undefined || isRecord(filters.selectionPolicy),
        `profile ${profile.key} selectionPolicy must be an object`);
      if (filters.aggregation !== undefined) {
        const aggregate = filters.aggregation;
        assert(isRecord(aggregate) && aggregate.schema === "evlive-filter-aggregates/v1",
          `profile ${profile.key} aggregation schema is invalid`);
        const fields = new Set(["schema", "axisKeys", "axisMatchModes", "rows", "rowsGzip", "rowCount", "rowsAsset", "costPerGame", "exchange", "medalsPerGame", "junzou", "bet", "investmentMinimum", "minPlay", "roundingEpsilon"]);
        assert(Object.keys(aggregate).every(key => fields.has(key)), `profile ${profile.key} aggregation contains unsupported fields`);
        assert(Array.isArray(filters.axes) && filters.axes.every(axis => isRecord(axis) && Array.isArray(axis.options)) && Array.isArray(aggregate.axisKeys)
          && JSON.stringify(aggregate.axisKeys) === JSON.stringify(filters.axes.map(axis => axis.key)),
        `profile ${profile.key} aggregation axisKeys must match the declared axes`);
        validateAggregateMatchModes(aggregate.axisMatchModes, filters.axes);
        for (const key of ["costPerGame", "exchange", "medalsPerGame", "bet"] as const) {
          assert(Number.isFinite(aggregate[key]) && aggregate[key] > 0,
            `profile ${profile.key} aggregation ${key} must be positive and finite`);
        }
        assert(Number.isFinite(aggregate.junzou) && aggregate.junzou >= 0,
          `profile ${profile.key} aggregation junzou must be nonnegative and finite`);
        assert(aggregate.investmentMinimum === "mean" || aggregate.investmentMinimum === "total",
          `profile ${profile.key} aggregation investmentMinimum is invalid`);
        assert(aggregate.minPlay === undefined || (Number.isFinite(aggregate.minPlay) && aggregate.minPlay >= 0),
          `profile ${profile.key} aggregation minPlay must be nonnegative and finite`);
        assert(Number.isFinite(aggregate.roundingEpsilon) && aggregate.roundingEpsilon >= 0 && aggregate.roundingEpsilon < 0.25,
          `profile ${profile.key} aggregation roundingEpsilon is invalid`);
        if (aggregate.rowsAsset !== undefined) {
          assert(aggregate.rows === undefined && aggregate.rowsGzip === undefined && aggregate.rowCount === undefined,
            `profile ${profile.key} aggregation asset must not contain inline rows`);
          validateAggregationRowsAsset(aggregate.rowsAsset);
        } else if (aggregate.rows !== undefined) {
          assert(aggregate.rowsGzip === undefined && aggregate.rowCount === undefined,
            `profile ${profile.key} aggregation must contain rows or compressed rows, not both`);
          validateAggregateRows(aggregate.rows, filters.axes, undefined, aggregate.axisMatchModes);
        } else {
          assert(typeof aggregate.rowsGzip === "string" && aggregate.rowsGzip.length > 0
            && aggregate.rowsGzip.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(aggregate.rowsGzip),
          `profile ${profile.key} aggregation rowsGzip must be base64`);
          assert(Number.isSafeInteger(aggregate.rowCount) && aggregate.rowCount >= 0,
            `profile ${profile.key} aggregation rowCount is invalid`);
        }
      }
      if (filters.axes !== undefined) {
        assert(Array.isArray(filters.axes), `profile ${profile.key} filter axes must be an array`);
        const filterKeys = new Set<string>();
        for (const axis of filters.axes) {
          assert(isRecord(axis) && typeof axis.key === "string" && axis.key.length > 0 && !filterKeys.has(axis.key),
            `profile ${profile.key} filter axis keys must be unique nonempty strings`);
          filterKeys.add(axis.key);
          assert(typeof axis.label === "string" && axis.label.length > 0 && typeof axis.allLabel === "string",
            `profile ${profile.key} filter axis labels are required`);
          assert(Array.isArray(axis.options), `profile ${profile.key} filter options must be an array`);
          const values = new Set<string>();
          for (const option of axis.options) {
            assert(isRecord(option) && typeof option.value === "string" && option.value.length > 0 && !values.has(option.value)
              && typeof option.label === "string", `profile ${profile.key} filter options must have unique nonempty values and labels`);
            values.add(option.value);
          }
        }
        // 旧生成物には、削除済みの軸の孤立表が残る。UIからは選べないため許容し、
        // 新しい契約を宣言する生成物では全キーを厳密に確認する。
        if (profile.aimKind || filters.selectionPolicy || filters.aggregation) {
          for (const key of Object.keys(filters.tables)) {
            assert(isExactFilterTableKey(filters.axes, key), `profile ${profile.key} filter table ${key} must match exactly one declared selection`);
          }
        }
      }
      for (const [key, table] of Object.entries(filters.tables)) {
        assert(isRecord(table) && Array.isArray(table.baseAnchors), `profile ${profile.key} filter ${key} anchors are required`);
        const start = table.start ?? profile.gRange.start;
        assert(Number.isFinite(start) && Number.isFinite(table.end) && table.end >= start,
          `profile ${profile.key} filter ${key} range is invalid`);
        for (const field of ["hits", "units"] as const) {
          assert(Number.isSafeInteger(table[field]) && table[field] >= 0, `profile ${profile.key} filter ${key} ${field} must be a nonnegative integer`);
        }
        assert(Number.isFinite(table.totalPayout) && (table.firstHitRate === null || Number.isFinite(table.firstHitRate)),
          `profile ${profile.key} filter ${key} aggregates must be finite`);
        let previous = Number.NEGATIVE_INFINITY;
        for (const anchor of table.baseAnchors) {
          assert(isRecord(anchor) && Number.isFinite(anchor.g) && Number.isFinite(anchor.ev) && Number.isFinite(anchor.rtp),
            `profile ${profile.key} filter ${key} anchors must be finite`);
          assert(anchor.g >= start && anchor.g <= table.end && anchor.g > previous,
            `profile ${profile.key} filter ${key} anchors must be ordered and in range`);
          previous = anchor.g;
          for (const field of ["n", "inv", "playG"] as const) {
            assert(anchor[field] === undefined || (Number.isFinite(anchor[field]) && anchor[field]! >= 0),
              `profile ${profile.key} filter ${key} ${field} must be nonnegative`);
          }
        }
      }
    }

    // A data-pending profile has no 実戦 data yet: the tab is shown but no table is
    // rendered, so the anchor/zone constraints below do not apply.
    if (profile.dataPending) continue;

    const minimumAnchors = profile.evFilters?.aggregation ? 1 : 2;
    assert(profile.baseAnchors.length >= minimumAnchors, `profile ${profile.key} must have at least ${minimumAnchors} anchors`);
    for (let i = 0; i < profile.baseAnchors.length; i += 1) {
      const anchor = profile.baseAnchors[i];
      assert(anchor.g >= profile.gRange.start && anchor.g <= profile.gRange.end, `anchor ${anchor.g} is out of range`);
      assert((anchor.rtp >= 100) === (anchor.ev >= 0), `anchor ${anchor.g} EV/RTP sign mismatch`);
      // Sample size is optional (older data omits it); when present it must be a non-negative number.
      assert(
        anchor.n === undefined || (typeof anchor.n === "number" && Number.isFinite(anchor.n) && anchor.n >= 0),
        `anchor ${anchor.g} n must be a non-negative number`
      );
      // Average investment (medals) is optional; when present it must be a non-negative number.
      assert(
        anchor.inv === undefined || (typeof anchor.inv === "number" && Number.isFinite(anchor.inv) && anchor.inv >= 0),
        `anchor ${anchor.g} inv must be a non-negative number`
      );
      // Average session games (時給用) is optional; when present it must be a non-negative number.
      assert(
        anchor.playG === undefined || (typeof anchor.playG === "number" && Number.isFinite(anchor.playG) && anchor.playG >= 0),
        `anchor ${anchor.g} playG must be a non-negative number`
      );
      if (i > 0) {
        assert(anchor.g > profile.baseAnchors[i - 1].g, `anchors must be sorted for ${profile.key}`);
      }
    }
    for (const zone of profile.zones) {
      assert(zone.g >= profile.gRange.start && zone.g <= profile.gRange.end, `zone ${zone.g} is out of range`);
    }
  }

  if (machine.setting1Correction !== undefined) {
    const correction = machine.setting1Correction;
    assert(isRecord(correction), "setting1Correction must be an object");
    assert(correction.schemaVersion === 1, "unsupported setting1Correction schema");
    assert(correction.sourceHallId === "shinjuku" || correction.sourceHallId === "mixed",
      "setting1Correction source must be shinjuku or mixed");
    assert(Number.isFinite(correction.targetRtp) && correction.targetRtp > 0 && correction.targetRtp < 1,
      "setting1Correction targetRtp must be between 0 and 1");
    assert(Number.isFinite(correction.payoutScale) && correction.payoutScale > 0,
      "setting1Correction payoutScale must be positive and finite");
    assert(correction.method === "payout-scale" || correction.method === "assumed-payout",
      "unknown setting1Correction method");
    assert(correction.method !== "assumed-payout" || correction.payoutScale === 1,
      "assumed payout must not be corrected twice");
    assert(Array.isArray(correction.profiles) && correction.profiles.length > 0,
      "setting1Correction profiles are required");
    const sourceKeys = machine.profiles.filter((profile) => !profile.label.includes("設定1想定")).map((profile) => profile.key);
    assert(JSON.stringify(correction.profiles.map((profile) => profile.key)) === JSON.stringify(sourceKeys),
      "setting1Correction must preserve the source profile order and keys");
    // Reuse the public profile contract, without recursively validating the bundle.
    validateMachine({ ...machine, profiles: correction.profiles, setting1Correction: undefined });
    for (const profile of correction.profiles) {
      const tables = [profile, ...Object.values(profile.evFilters?.tables ?? {})];
      for (const table of tables) {
        assert(Array.isArray(table.baseAnchors), "setting1Correction table anchors are required");
        for (const anchor of table.baseAnchors) {
          assert(Number.isFinite(anchor.g) && Number.isFinite(anchor.ev) && Number.isFinite(anchor.rtp),
            "setting1Correction anchors must be finite");
        }
      }
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

  // ハラキリドライブ（台別推定率）は任意（対応機種＝ヴヴヴ2のみ）。あるときだけ形を検証する。
  if (machine.harakiri !== undefined) {
    const hk = machine.harakiri;
    assert(isRecord(hk), "harakiri must be an object");
    assert(typeof hk.label === "string", "harakiri.label must be a string");
    assert(typeof hk.note === "string", "harakiri.note must be a string");
    assert(typeof hk.threshold === "number" && hk.threshold > 0, "harakiri.threshold must be > 0");
    assert(isRecord(hk.total), "harakiri.total must be an object");
    for (const key of ["sessions", "rush", "hits", "rate"] as const) {
      const value = hk.total[key];
      assert(typeof value === "number" && Number.isFinite(value) && value >= 0, `harakiri.total.${key} must be >= 0`);
    }
    assert(Array.isArray(hk.units) && hk.units.length > 0, "harakiri.units must be a non-empty array");
    for (const unit of hk.units) {
      assert(typeof unit.unit === "string" && unit.unit.length > 0, "harakiri unit id is required");
      for (const key of ["sessions", "rush", "hits", "rate"] as const) {
        const value = unit[key];
        assert(
          typeof value === "number" && Number.isFinite(value) && value >= 0,
          `harakiri ${unit.unit} ${key} must be >= 0`
        );
      }
      // hits はラッシュ中の総ハラキリ回数（1ラッシュで複数回の大量上乗せがあり得る）なので
      // rush を超えることがある＝rateは100%超も正常。上限は課さない。
    }
  }

  const rateAxis = machine.axes.find((axis) => axis.key === "rate");
  assert(rateAxis?.type === "select", "rate axis must be a select axis");
  for (const option of rateAxis.options) {
    assert(typeof machine.creditValue[option.value] === "number", `creditValue missing ${option.value}`);
  }

  return machine;
}
