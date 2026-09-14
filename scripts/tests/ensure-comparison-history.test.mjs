import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const helper = fileURLToPath(new URL("../ensure-comparison-history.mjs", import.meta.url));
const git = (cwd, ...args) => execFileSync("git", args, {
  cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
}).trim();

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "evlive-history-test-"));
  t.after(() => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith("evlive-history-test-"));
    rmSync(resolved, { recursive: true, force: true });
  });
  const source = path.join(root, "source");
  git(root, "init", "--initial-branch=main", source);
  git(source, "config", "user.name", "History test");
  git(source, "config", "user.email", "history@example.invalid");
  let count = 0;
  function commit(message = "data update") {
    writeFileSync(path.join(source, `file-${count++}.txt`), message);
    git(source, "add", ".");
    git(source, "commit", "-m", message);
    return git(source, "rev-parse", "HEAD");
  }
  function clone() {
    const target = path.join(root, "clone");
    git(root, "clone", "--depth=2", "--single-branch", "--branch=main", pathToFileURL(source).href, target);
    return target;
  }
  const run = (target, base) => spawnSync(process.execPath, [helper, "--base", base], { cwd: target, encoding: "utf8" });
  return { source, commit, clone, run };
}

test("a one-commit update uses depth 2 without fetching more history", t => {
  const f = fixture(t);
  const base = f.commit();
  f.commit();
  const target = f.clone();
  git(target, "remote", "set-url", "origin", path.join(target, "unavailable"));
  const result = f.run(target, base);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /追加取得 0回/);
});

test("a multi-commit push retrieves the complete permission-message range", t => {
  const f = fixture(t);
  const base = f.commit();
  f.commit("approved correction [allow-data-regression]");
  f.commit(); f.commit(); f.commit();
  const target = f.clone();
  assert.equal(f.run(target, base).status, 0);
  assert.match(git(target, "log", "--format=%B", `${base}..HEAD`), /allow-data-regression/);
});

test("BASE being present does not hide a truncated merged side branch", t => {
  const f = fixture(t);
  f.commit();
  git(f.source, "checkout", "-b", "side");
  f.commit("side correction [allow-data-regression]");
  f.commit("side followup");
  git(f.source, "checkout", "main");
  const base = f.commit("main update");
  git(f.source, "merge", "--no-ff", "side", "-m", "merge side");
  const target = f.clone();
  git(target, "cat-file", "-e", `${base}^{commit}`);
  assert.doesNotMatch(git(target, "log", "--format=%B", `${base}..HEAD`), /allow-data-regression/);
  const result = f.run(target, base);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /深めます/);
  assert.match(git(target, "log", "--format=%B", `${base}..HEAD`), /allow-data-regression/);
});

test("an unavailable remote cannot silently skip a missing base", t => {
  const f = fixture(t);
  const base = f.commit(); f.commit(); f.commit();
  const target = f.clone();
  git(target, "remote", "set-url", "origin", path.join(target, "unavailable"));
  assert.equal(f.run(target, base).status, 2);
});

test("a base outside the ancestry fails after available history is fetched", t => {
  const f = fixture(t);
  f.commit(); f.commit(); f.commit();
  const target = f.clone();
  const result = f.run(target, "1".repeat(40));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /公開を停止/);
});

test("an arbitrary ref or option is rejected before fetching", t => {
  const f = fixture(t);
  f.commit();
  const result = f.run(f.clone(), "--upload-pack=unexpected");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /有効なコミットSHA/);
});

test("a corrupt shallow boundary is a failure, not an unrelated branch", t => {
  const f = fixture(t);
  const base = f.commit(); f.commit();
  const target = f.clone();
  writeFileSync(path.join(target, ".git", "shallow"), `${base}\n${"f".repeat(40)}\n`);
  const result = f.run(target, base);
  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stdout, /追加取得 0回/);
});
