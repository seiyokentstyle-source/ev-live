import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { checkDataRegression, samplesOf } from "../check-data-regression.mjs";
import {
  comparisonDate, dateRegression, isDate, LEGACY_DATA_DATES, snapshotHash, sourcePeriod
} from "../data-date-compatibility.mjs";

const FILE = "data/machines/fixture.json";
const machine = (day = "2026-09-07", count = "1,000") => ({
  name: "Fixture", lastUpdated: day,
  meta: { samples: count, source: `実戦データ自動収集（2026-06-09〜${day}・全データ）／注記` },
  anchors: [{ g: 0, ev: 123 }]
});
const old = { ...machine("2026-09-05"), lastUpdated: "2026-09-13" };
const manifest = {
  recordedLastUpdated: "2026-09-13", dataThrough: "2026-09-05",
  files: { [FILE]: snapshotHash(old) }
};

function repo(t, baseData = machine()) {
  const dir = mkdtempSync(join(tmpdir(), "evlive-data-guard-"));
  t.after(() => {
    const root = resolve(tmpdir()) + "/";
    const target = resolve(dir).replaceAll("\\", "/");
    assert.ok(target.startsWith(root.replaceAll("\\", "/") + "evlive-data-guard-"));
    rmSync(dir, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync("git", args, {
    cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim();
  git("init", "-q");
  git("config", "user.name", "Guard test");
  git("config", "user.email", "guard@example.invalid");
  git("config", "commit.gpgsign", "false");
  mkdirSync(join(dir, "data/machines"), { recursive: true });
  const write = (data) => writeFileSync(join(dir, FILE), typeof data === "string" ? data : JSON.stringify(data));
  const commit = (message) => {
    git("add", "-A"); git("commit", "--allow-empty", "-qm", message);
    return git("rev-parse", "HEAD");
  };
  write(baseData);
  const base = commit("base");
  const messages = [];
  const check = (extra = {}) => {
    messages.length = 0;
    return checkDataRegression({ cwd: dir, baseRef: base, log: m => messages.push(m), error: m => messages.push(m), ...extra });
  };
  return { dir, git, write, commit, base, check, messages };
}

test("only exact known snapshots at their original path get a legacy comparison date", () => {
  assert.deepEqual(comparisonDate(FILE, old, manifest), { date: "2026-09-05", legacy: true });
  for (const changed of [
    { ...old, anchors: [{ g: 0, ev: 124 }] },
    { ...old, meta: { ...old.meta, samples: "1,001" } },
    { ...old, intervalExplorer: { private: true } }
  ]) assert.equal(comparisonDate(FILE, changed, manifest).legacy, false);
  assert.equal(comparisonDate("data/machines/another.json", old, manifest).legacy, false);
  assert.equal(snapshotHash(JSON.parse(JSON.stringify(old, null, 2).replaceAll("\n", "\r\n"))), snapshotHash(old));
});

test("the compatibility manifest is bounded to the observed run and 58 exact hashes", () => {
  assert.equal(LEGACY_DATA_DATES.sourceCommit, "fc18d936f2d3f4b6449f6a0bef474db9fb2249fd");
  assert.equal(LEGACY_DATA_DATES.recordedLastUpdated, "2026-09-13");
  assert.equal(LEGACY_DATA_DATES.dataThrough, "2026-09-05");
  assert.equal(Object.keys(LEGACY_DATA_DATES.files).length, 58);
  for (const [file, hash] of Object.entries(LEGACY_DATA_DATES.files)) {
    assert.match(file, /^data\/machines\/[a-z0-9]+\.json$/);
    assert.match(hash, /^[a-f0-9]{64}$/);
  }
});

test("known legacy data migrates to the same or a later verified data-period end", () => {
  for (const day of ["2026-09-05", "2026-09-07"]) {
    const result = dateRegression(FILE, old, machine(day), manifest);
    assert.equal(result.rollback, false);
    assert.equal(result.migrated, true);
  }
  assert.equal(dateRegression(FILE, old, old, manifest).rollback, false);
});

test("true rollback and reintroduction of the known old snapshot stay blocked", () => {
  assert.equal(dateRegression(FILE, old, machine("2026-09-04"), manifest).rollback, true);
  assert.equal(dateRegression(FILE, machine("2026-09-07"), old, manifest).rollback, true);
  assert.equal(dateRegression(FILE, machine("2026-09-07"), machine("2026-09-06"), manifest).rollback, true);
  // Matching source syntax cannot authorize an unknown snapshot's raw date drop.
  assert.equal(dateRegression(FILE, { ...old, extra: true }, machine(), manifest).rollback, true);
});

test("correction requires valid exact source syntax with an end equal to lastUpdated", () => {
  for (const source of [
    undefined, "2026-09-07", "実戦データ自動収集（2026-06-09〜2026-09-07・直近8日）",
    "実戦データ自動収集（2026-06-09〜2026-09-08・全データ）",
    "実戦データ自動収集（2026-09-08〜2026-09-07・全データ）",
    "実戦データ自動収集（2026-02-30〜2026-09-07・全データ）",
    "注記：実戦データ自動収集（2026-06-09〜2026-09-07・全データ）",
    "実戦データ自動収集（2026-06-09〜2026-09-07・全データ）garbage"
  ]) {
    const head = machine(); head.meta.source = source;
    assert.equal(dateRegression(FILE, old, head, manifest).rollback, true, String(source));
  }
  assert.equal(sourcePeriod(machine()).end, "2026-09-07");
  assert.equal(isDate("2026-02-29"), false);
  assert.equal(isDate("2024-02-29"), true);
});

test("ordinary same-date/increasing data and the exact 10% loss boundary pass", (t) => {
  const r = repo(t);
  for (const data of [machine(), machine("2026-09-08", "1,200"), machine("2026-09-08", "900")]) {
    r.write(data); assert.equal(r.check(), 0);
  }
  r.write(machine("2026-09-08", "899"));
  assert.equal(r.check(), 1);
  assert.match(r.messages.join("\n"), /サンプル/);
});

test("real date rollback fails even with allow-data-regression and increasing samples", (t) => {
  const r = repo(t);
  r.write(machine("2026-09-06", "1,200"));
  r.commit("spec correction [allow-data-regression]");
  assert.equal(r.check(), 1);
  assert.match(r.messages.join("\n"), /巻き戻し/);
});

test("sample loss and removal only pass with the existing explicit commit signal", (t) => {
  const r = repo(t);
  r.write(machine("2026-09-08", "100"));
  assert.equal(r.check(), 1);
  r.commit("spec correction [allow-data-regression]");
  assert.equal(r.check(), 0);
  unlinkSync(join(r.dir, FILE));
  assert.equal(r.check(), 0);
});

test("an unapproved missing machine file fails", (t) => {
  const r = repo(t);
  unlinkSync(join(r.dir, FILE));
  assert.equal(r.check(), 1);
});

test("malformed or invalid HEAD always fails closed even with an allow signal", (t) => {
  const r = repo(t);
  r.commit("spec correction [allow-data-regression]");
  for (const bad of [
    "{broken", "null", "[]", {}, { ...machine(), lastUpdated: "2026-02-30" },
    { ...machine(), meta: { samples: "NaN" } },
    { ...machine(), meta: { samples: "" } }, { ...machine(), meta: {} }
  ]) { r.write(bad); assert.equal(r.check(), 2, JSON.stringify(bad)); }
});

test("invalid BASE JSON cannot be skipped or classified as a removed machine", (t) => {
  const r = repo(t, "{broken");
  r.write(machine());
  r.commit("repair [allow-data-regression]");
  assert.equal(r.check(), 2);
  assert.match(r.messages.join("\n"), /JSONを解析できません/);
});

test("unreadable BASE blob fails closed", (t) => {
  const r = repo(t);
  const object = r.git("rev-parse", `${r.base}:${FILE}`);
  unlinkSync(join(r.dir, ".git/objects", object.slice(0, 2), object.slice(2)));
  assert.equal(r.check(), 2);
  assert.match(r.messages.join("\n"), /比較データを確認できません/);
});

test("an unreadable working-tree path is not treated as an allowed deletion", (t) => {
  const r = repo(t);
  r.commit("remove bad machine [allow-data-regression]");
  unlinkSync(join(r.dir, FILE));
  mkdirSync(join(r.dir, FILE));
  assert.equal(r.check(), 2);
});

test("missing BASE and invalid tolerance cannot silently pass", (t) => {
  const r = repo(t);
  assert.equal(r.check({ baseRef: "missing-ref" }), 2);
  for (const tolerance of [NaN, -0.1, 1.1]) assert.equal(r.check({ tolerance }), 2);
});

test("sample parsing rejects invalid values instead of bypassing the loss comparison", () => {
  for (const value of ["", "1,00", "1e3", "NaN", -1, [], false, 1.2]) {
    assert.equal(samplesOf({ meta: { samples: value } }), null, JSON.stringify(value));
  }
  assert.equal(samplesOf({ meta: { samples: "1,234" } }), 1234);
  assert.equal(samplesOf({ meta: { samples: 0 } }), 0);
});
