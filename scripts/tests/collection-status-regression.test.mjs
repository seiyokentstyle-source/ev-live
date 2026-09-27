import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { checkDataRegression } from "../check-data-regression.mjs";
import { parseCollectionStatus, collectionMachineIdentityLosses } from "../collection-status-validation.mjs";

const FILE = "data/halls/kabuki/collection-status.json";
function entry(id = "fixture") {
  const name = id === "fixture" ? "Fixture" : "Another machine";
  return {
    id, name, manufacturer: "Maker", aliases: [name], releaseDate: "2026-01-01",
    lastUpdated: "2026-09-24", status: "pending", reasonCode: "sample_insufficient",
    pendingReason: "収集済みですが期待値算出を保留しています。", forcePending: false,
    collectionComplete: true, expectedUnits: 4,
    collection: { rows: 100, events: 90, units: 4, days: 2, firstDate: "2026-09-22", lastDate: "2026-09-24" },
    sourceIntegrity: { schemaVersion: 1, hallId: "kabuki", machineName: name,
      targetDate: "2026-09-24", inputSha256: "a".repeat(64) }
  };
}
function catalog() {
  return { schema: "evlive-collection-status/v1", hallId: "kabuki", lastUpdated: "2026-09-24",
    source: "daidata", storeId: "100949", machines: [entry()] };
}
const parse = data => parseCollectionStatus(JSON.stringify(data), FILE);

function repository(t, initial = catalog()) {
  const dir = mkdtempSync(join(tmpdir(), "evlive-catalog-guard-"));
  t.after(() => {
    const root = resolve(tmpdir()).replaceAll("\\", "/") + "/evlive-catalog-guard-";
    assert.ok(resolve(dir).replaceAll("\\", "/").startsWith(root));
    rmSync(dir, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q");
  git("config", "user.name", "Catalog guard test");
  git("config", "user.email", "catalog@example.invalid");
  git("config", "commit.gpgsign", "false");
  mkdirSync(join(dir, "data/halls/kabuki"), { recursive: true });
  mkdirSync(join(dir, "data/machines/kabuki"), { recursive: true });
  const machine = { id: "fixture", name: "Fixture", lastUpdated: "2026-09-24", meta: { samples: "100" } };
  const machinePath = join(dir, "data/machines/kabuki/fixture.json");
  const machineBytes = JSON.stringify(machine);
  writeFileSync(machinePath, machineBytes);
  const write = data => writeFileSync(join(dir, FILE), typeof data === "string" ? data : JSON.stringify(data));
  const commit = message => { git("add", "-A"); git("commit", "--allow-empty", "-qm", message); return git("rev-parse", "HEAD"); };
  if (initial !== null) write(initial);
  const base = commit("base");
  const messages = [];
  const check = () => {
    messages.length = 0;
    return checkDataRegression({ baseRef: base, cwd: dir, tolerance: 1, log: text => messages.push(text), error: text => messages.push(text) });
  };
  return { dir, git, write, commit, check, messages, machineBytes, machinePath };
}

test("signed daily observations can have no history signals while still proving collected units", () => {
  const data = catalog();
  data.machines[0].collection.rows = 0;
  data.machines[0].collection.events = 0;
  assert.equal(parse(data).machines[0].collection.units, 4);
  data.machines[0].collection.units = 0;
  assert.throws(() => parse(data), /整数件数/);
});

test("Site Seven uses its registered hall code and an unknown machine never invents a release date", () => {
  const data = catalog();
  Object.assign(data, { source: "site_seven", storeId: "00001050", hallId: "shinjuku" });
  Object.assign(data.machines[0], { manufacturer: "未確認", releaseDate: null });
  data.machines[0].sourceIntegrity.hallId = "shinjuku";
  const parseSiteSeven = () => parseCollectionStatus(JSON.stringify(data), "data/halls/shinjuku/collection-status.json");
  assert.equal(parseSiteSeven().machines[0].releaseDate, null);
  for (const id of ["123", "0000/1050", "１2345678", "1".repeat(17)]) {
    data.storeId = id;
    assert.throws(parseSiteSeven, /取得元/);
  }
  data.storeId = "00001050";
  data.source = "other";
  assert.throws(parseSiteSeven, /取得元/);
  data.source = "daidata";
  assert.throws(parseSiteSeven, /取得元/);
});

test("formal registration can complete unknown metadata under the original ID without erasing its source names", t => {
  const initial = catalog();
  Object.assign(initial.machines[0], { manufacturer: "未確認", releaseDate: null });
  const r = repository(t, initial);
  const registered = structuredClone(initial);
  Object.assign(registered.machines[0], { name: "Registered name", manufacturer: "Verified maker", releaseDate: "2026-09-01" });
  registered.machines[0].sourceIntegrity.machineName = "Canonical name";
  registered.machines[0].aliases.push("Registered name", "Canonical name");
  r.write(registered); assert.equal(r.check(), 0);

  const renamedId = structuredClone(registered); renamedId.machines[0].id = "different";
  r.write(renamedId); assert.equal(r.check(), 1);
  const forgotten = structuredClone(registered); forgotten.machines[0].aliases = ["Registered name", "Canonical name"];
  r.write(forgotten); assert.equal(r.check(), 1);
  const lostRows = structuredClone(registered); lostRows.machines[0].collection.rows = 99;
  r.write(lostRows); assert.equal(r.check(), 1);
  const duplicate = structuredClone(initial);
  duplicate.machines.push({ ...structuredClone(registered.machines[0]), id: "different" });
  r.write(duplicate); assert.equal(r.check(), 1);
  assert.match(r.messages.join("\n"), /機種ID/);
  const distinct = structuredClone(initial);
  const sequel = entry("sequel");
  sequel.name = sequel.sourceIntegrity.machineName = "Fixture II";
  sequel.aliases = ["Fixture II"];
  distinct.machines.push(sequel);
  r.write(distinct); assert.equal(r.check(), 0);
});

test("formal machine metadata cannot be silently rewritten through the unknown-machine admission rule", t => {
  const r = repository(t);
  for (const field of ["manufacturer", "releaseDate"]) {
    const data = catalog();
    data.machines[0][field] = field === "manufacturer" ? "Changed maker" : null;
    r.write(data); assert.equal(r.check(), 1);
  }
});

test("saved observations can survive an unknown current unit list without inventing an expected count", () => {
  const data = catalog();
  data.machines[0].collectionComplete = false;
  delete data.machines[0].expectedUnits;
  assert.equal(parse(data).machines[0].collection.units, 4);
  for (const count of [0, -1, "4", null, 1.5]) {
    data.machines[0].expectedUnits = count;
    assert.throws(() => parse(data), /整数件数/);
  }
});

test("catalog schema rejects raw records, duplicate identities and malformed aggregate evidence", () => {
  const mutations = [
    data => { data.rows = [{ private: true }]; },
    data => { data.schema = "other"; },
    data => { data.hallId = "shinjuku"; },
    data => { data.storeId = 100949; },
    data => { data.machines = []; },
    data => { data.machines.push(structuredClone(data.machines[0])); },
    data => { data.machines.push({ ...structuredClone(data.machines[0]), id: "another" }); },
    data => { data.machines[0].privateRows = []; },
    data => { data.machines[0].aliases = ["other"]; },
    data => { data.machines[0].aliases.push("Fixture"); },
    data => { data.machines[0].releaseDate = ""; },
    data => { data.machines[0].forcePending = "false"; },
    data => { data.machines[0].reasonCode = "other"; },
    data => { data.machines[0].expectedUnits = 0; },
    data => { data.machines[0].collection.events = 101; },
    data => { data.machines[0].collection.days = 4; },
    data => { data.machines[0].collection.rows = "100"; },
    data => { data.machines[0].collection.rows = Number.MAX_SAFE_INTEGER + 1; },
    data => { data.machines[0].collection.firstDate = "2026-02-30"; },
    data => { data.machines[0].collection.lastDate = "2026-09-23"; },
    data => { data.machines[0].sourceIntegrity.hallId = "shinjuku"; },
    data => { data.machines[0].sourceIntegrity.machineName = "another"; },
    data => { data.machines[0].sourceIntegrity.inputSha256 = "bad"; },
    data => { data.machines[0].sourceIntegrity.targetDate = "2026-09-23"; },
    data => { data.lastUpdated = "2026-09-25"; }
  ];
  for (const mutate of mutations) {
    const data = catalog(); mutate(data);
    assert.throws(() => parse(data));
  }
});

test("new generated catalogs are validated without requiring a baseline catalog", t => {
  const r = repository(t, null);
  r.write(catalog()); assert.equal(r.check(), 0);
  const data = catalog(); data.machines[0].collection.events = -1;
  r.write(data); assert.equal(r.check(), 2);
});

test("growing catalogs allow new-day incompleteness, eligibility progress and lower current expected units", t => {
  const r = repository(t);
  assert.equal(r.check(), 0);
  const data = catalog();
  data.lastUpdated = "2026-09-25";
  const value = data.machines[0];
  value.lastUpdated = value.collection.lastDate = value.sourceIntegrity.targetDate = data.lastUpdated;
  Object.assign(value.collection, { rows: 120, events: 95, units: 5, days: 3 });
  value.expectedUnits = 2;
  value.collectionComplete = false;
  value.reasonCode = "collection_incomplete";
  data.machines.push(entry("another"));
  r.write(data);
  assert.equal(r.check(), 0);
});

test("every stored catalog count is monotonic even with full tolerance and the allow signal", t => {
  const r = repository(t);
  r.commit("correction [allow-data-regression]");
  for (const key of ["rows", "events", "units", "days"]) {
    const data = catalog(); data.machines[0].collection[key] -= 1;
    r.write(data);
    assert.equal(r.check(), 1, key);
    assert.match(r.messages.join("\n"), new RegExp(`collection\\.${key}`));
  }
});

test("catalog periods and observation dates cannot regress even if other counts grow", t => {
  const r = repository(t);
  r.commit("correction [allow-data-regression]");
  const shorter = catalog(); shorter.machines[0].collection.firstDate = "2026-09-23";
  r.write(shorter); assert.equal(r.check(), 1);
  const older = catalog();
  older.lastUpdated = older.machines[0].lastUpdated = older.machines[0].collection.lastDate = older.machines[0].sourceIntegrity.targetDate = "2026-09-23";
  older.machines[0].collection.rows = 200;
  r.write(older); assert.equal(r.check(), 1);
  assert.match(r.messages.join("\n"), /巻き戻|収集期間/);
});

test("neither a calculated machine nor an allow signal permits erasing a catalog entry or file", t => {
  const initial = catalog(); initial.machines.push(entry("another"));
  const r = repository(t, initial);
  r.commit("promotion [allow-data-regression]");
  // The numeric machine already exists; its independent observation remains required.
  const removed = catalog(); removed.machines = [entry("another")];
  r.write(removed); assert.equal(r.check(), 1);
  assert.match(r.messages.join("\n"), /収集済み機種が消えています/);
  unlinkSync(join(r.dir, FILE));
  assert.equal(r.check(), 1);
  assert.match(r.messages.join("\n"), /収集状況JSONが消えています/);
});

test("source and machine identity cannot change under a retained catalog key", t => {
  const r = repository(t);
  r.commit("rename [allow-data-regression]");
  const moved = catalog(); moved.storeId = "100950";
  r.write(moved); assert.equal(r.check(), 1);
  const renamed = catalog(); renamed.machines[0].name = "Renamed";
  renamed.machines[0].aliases.push("Renamed");
  r.write(renamed); assert.equal(r.check(), 1);
  const reidentified = catalog(); reidentified.machines[0].sourceIntegrity.machineName = "Another identity";
  reidentified.machines[0].aliases.push("Another identity");
  r.write(reidentified); assert.equal(r.check(), 1);
});

test("an invalid baseline catalog cannot disappear or be repaired through the allow signal", t => {
  const r = repository(t, "{broken");
  r.write(catalog()); r.commit("repair [allow-data-regression]");
  assert.equal(r.check(), 2);
  assert.match(r.messages.join("\n"), /収集状況JSON/);
});

test("catalog additions cannot bypass the original numeric machine guards", t => {
  const r = repository(t, null);
  r.write(catalog());
  const machine = JSON.parse(r.machineBytes); machine.lastUpdated = "2026-09-23";
  writeFileSync(r.machinePath, JSON.stringify(machine));
  r.commit("catalog [allow-data-regression]");
  assert.equal(r.check(), 1);
  assert.match(r.messages.join("\n"), /巻き戻し/);
});

test("numeric admission matches catalog full identities but never joins two abbreviation aliases", () => {
  const data = catalog();
  data.machines[0].aliases.push("Shared nickname", "Canonical complete name");
  data.machines[0].sourceIntegrity.machineName = "Canonical complete name";
  for (const fullName of ["Fixture", "Canonical complete name"]) {
    assert.equal(collectionMachineIdentityLosses(data, { id: "other", name: fullName }, "numeric").length, 1);
    assert.equal(collectionMachineIdentityLosses(data, { id: "other", name: "Display", aliases: [fullName] }, "numeric").length, 1);
    assert.deepEqual(collectionMachineIdentityLosses(data, { id: "fixture", name: fullName }, "numeric"), []);
  }
  assert.deepEqual(collectionMachineIdentityLosses(data,
    { id: "sequel", name: "Fixture II", aliases: ["Shared nickname", "Canonical complete name II"] }, "numeric"), []);
});

test("a new numeric JSON cannot use a different ID when the existing same-hall catalog is unchanged", t => {
  const r = repository(t);
  r.commit("new table [allow-data-regression]");
  const wrong = { id: "other", name: "Fixture", aliases: [], lastUpdated: "2026-09-24", meta: { samples: "100" } };
  writeFileSync(join(r.dir, "data/machines/kabuki/other.json"), JSON.stringify(wrong));
  assert.equal(r.check(), 1);
  assert.match(r.messages.join("\n"), /数値公開ID/);
  wrong.name = "Another model"; wrong.aliases = ["Fixture"];
  writeFileSync(join(r.dir, "data/machines/kabuki/other.json"), JSON.stringify(wrong));
  assert.equal(r.check(), 1);
  unlinkSync(join(r.dir, "data/machines/kabuki/other.json"));
  writeFileSync(join(r.dir, "data/machines/other.json"), JSON.stringify(wrong));
  assert.equal(r.check(), 0); // A Kabuki catalog must not bind a Shinjuku identity.
});

test("a later update of an existing numeric file cannot attach a collected identity under another ID", t => {
  const r = repository(t);
  const file = join(r.dir, "data/machines/kabuki/other.json");
  const numeric = { id: "other", name: "Unrelated", lastUpdated: "2026-09-24", meta: { samples: "100" } };
  writeFileSync(file, JSON.stringify(numeric));
  const base = r.commit("unrelated model");
  numeric.aliases = ["Fixture"];
  writeFileSync(file, JSON.stringify(numeric));
  assert.equal(checkDataRegression({ baseRef: base, cwd: r.dir, log() {}, error() {} }), 1);
});

test("root numeric publications are checked against the Shinjuku Site Seven catalog", t => {
  const r = repository(t, null);
  const data = catalog();
  Object.assign(data, { hallId: "shinjuku", source: "site_seven", storeId: "00001050" });
  data.machines[0].sourceIntegrity.hallId = "shinjuku";
  mkdirSync(join(r.dir, "data/halls/shinjuku"), { recursive: true });
  writeFileSync(join(r.dir, "data/halls/shinjuku/collection-status.json"), JSON.stringify(data));
  writeFileSync(join(r.dir, "data/machines/wrong.json"), JSON.stringify({ id: "wrong", name: "Fixture", lastUpdated: "2026-09-24", meta: { samples: "100" } }));
  assert.equal(r.check(), 1);
  unlinkSync(join(r.dir, "data/machines/wrong.json"));
  writeFileSync(join(r.dir, "data/machines/fixture.json"), r.machineBytes);
  assert.equal(r.check(), 0);
});
