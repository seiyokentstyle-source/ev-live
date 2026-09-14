#!/usr/bin/env node
// Fetch only enough ancestry to compare BASE..HEAD, including merged branches.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function succeeds(...args) {
  try { git(...args); return true; } catch { return false; }
}

function isAncestor(ancestor, descendant) {
  try {
    git("merge-base", "--is-ancestor", ancestor, descendant);
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

export function comparisonIsComplete(base, head = "HEAD") {
  if (!succeeds("cat-file", "-e", `${base}^{commit}`) ||
      !isAncestor(base, head)) return false;
  const shallowPath = git("rev-parse", "--git-path", "shallow");
  if (!existsSync(shallowPath)) return true;
  const boundaries = readFileSync(shallowPath, "utf8").trim().split(/\s+/).filter(Boolean);
  // A shallow boundary in a merged side branch can hide permission messages
  // even when BASE itself exists. Missing ancestors must all predate BASE.
  return boundaries.every(boundary =>
    !isAncestor(boundary, head) || isAncestor(boundary, base));
}

export function ensureComparisonHistory(base) {
  if (!/^[a-f0-9]{40}$/i.test(base) || /^0+$/.test(base)) {
    throw new Error("比較先には有効なコミットSHAが必要です");
  }
  const head = git("rev-parse", "HEAD");
  let fetches = 0;
  for (const depth of [32, 128, 512, 2048, 8192]) {
    if (comparisonIsComplete(base, head)) {
      console.log(`比較範囲 ${base}..${head} を確認（追加取得 ${fetches}回）`);
      return;
    }
    if (git("rev-parse", "--is-shallow-repository") !== "true") break;
    // Fetch the workflow's fixed commit, not a main branch that can move while
    // collection is running. Never fetch gh-pages or unrelated refs/tags.
    console.log(`比較範囲が不足しているため ${depth}コミット分深めます`);
    git("fetch", "--no-tags", `--deepen=${depth}`, "origin", head);
    fetches += 1;
  }
  if (comparisonIsComplete(base, head)) return;
  throw new Error("比較先またはマージを含むコミット範囲を取得できません。公開を停止します");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const index = process.argv.indexOf("--base");
    ensureComparisonHistory(index < 0 ? "" : process.argv[index + 1]);
  } catch (error) {
    console.error(`✖ ${error.message}`);
    process.exitCode = 2;
  }
}
