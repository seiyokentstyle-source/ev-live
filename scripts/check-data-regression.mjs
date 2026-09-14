#!/usr/bin/env node
// Read-only guard for data/machines/**/*.json (including hall subdirectories).
// Dates never move backward. The one known execution-date defect is compared
// using the exact-snapshot migration in data-date-compatibility.mjs.
// [allow-data-regression] only permits >10% sample losses or removed files;
// it never permits date rollback or unreadable/invalid comparison data.
// Usage: node scripts/check-data-regression.mjs [--base origin/main] [--tolerance 0.1]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dateRegression, isDate } from "./data-date-compatibility.mjs";

const DIR = "data/machines";

export const samplesOf = (data) => {
  const raw = data?.meta?.samples;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const value = String(raw);
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)) return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};

function parseMachine(text, label) {
  let data;
  try { data = JSON.parse(text); }
  catch (error) { throw new Error(`${label}: JSONを解析できません: ${error.message}`); }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${label}: 機種JSONはオブジェクトである必要があります`);
  }
  if (!isDate(data.lastUpdated)) throw new Error(`${label}: lastUpdatedが有効な日付ではありません`);
  // Optional in older records, but a malformed supplied count is never absent.
  if (Object.hasOwn(data.meta ?? {}, "samples") && samplesOf(data) === null) {
    throw new Error(`${label}: meta.samplesが有効な件数ではありません`);
  }
  return data;
}

export function checkDataRegression({
  baseRef = "origin/main", tolerance = 0.1, cwd = process.cwd(),
  log = console.log, error = console.error
} = {}) {
  const git = (...args) => execFileSync("git", args, {
    cwd, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"]
  });
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
    error("✖ --tolerance は0以上1以下の数値で指定してください");
    return 2;
  }
  try {
    // Resolve a commit, not an arbitrary tree/path expression.
    const base = git("rev-parse", "--verify", `${baseRef}^{commit}`).trim();
    const files = git("ls-tree", "-r", "--name-only", base, "--", DIR)
      .split("\n").filter((file) => file.endsWith(".json"));
    // Failure is not equivalent to no permission: incomplete history must fail
    // closed. CI prepares/proves the complete BASE..HEAD graph before this call.
    const allowed = git("log", "--format=%B", `${base}..HEAD`).includes("[allow-data-regression]");
    const rollbacks = [];
    const decreases = [];
    const migrations = [];

    for (const file of files) {
      // ls-tree proved this blob exists at BASE. A show/parse failure cannot
      // mean a new/deleted file (and cannot silently skip comparisons).
      const before = parseMachine(git("show", `${base}:${file}`), `${baseRef}:${file}`);
      let text;
      try { text = readFileSync(resolve(cwd, file), "utf8"); }
      catch (readError) {
        if (readError.code !== "ENOENT") throw readError;
        decreases.push(`${before.name ?? file}: JSONが消えている（${file}）`);
        continue;
      }
      const after = parseMachine(text, file);
      const name = before.name ?? file;
      const dates = dateRegression(file, before, after);
      if (dates.rollback) {
        const reason = dates.invalidCorrection ? "旧出力からの変更にデータ末日の裏付けがない" : "古くなっている";
        rollbacks.push(`${name}: lastUpdated ${before.lastUpdated} → ${after.lastUpdated}`
          + ` / 比較対象日 ${dates.before.date} → ${dates.after.date}（${reason}）`);
      }
      if (dates.migrated) migrations.push(`${name}: 既知の生成日 ${before.lastUpdated} を対象末日 ${dates.before.date} として比較 → ${after.lastUpdated}`);
      const bN = samplesOf(before);
      const hN = samplesOf(after);
      if (bN !== null && hN === null) throw new Error(`${file}: meta.samplesが失われています`);
      if (bN !== null && hN !== null && bN > 0 && hN < bN * (1 - tolerance)) {
        decreases.push(`${name}: サンプル ${bN.toLocaleString()} → ${hN.toLocaleString()}`
          + `（-${(((bN - hN) / bN) * 100).toFixed(1)}%）`);
      }
    }
    log(`データ巻き戻りチェック: ${baseRef} と比較 / 許容 ${(tolerance * 100).toFixed(0)}%`);
    for (const message of migrations) log(`  日付互換: ${message}`);
    if (rollbacks.length) {
      error(`\n✖ 巻き戻し ${rollbacks.length}件（[allow-data-regression] でも通しません）`);
      for (const message of rollbacks) error(`   ${message}`);
    }
    if (decreases.length) {
      error(`\n${allowed ? "許可済み" : "✖"} データの減少 ${decreases.length}件`);
      for (const message of decreases) error(`   ${message}`);
    }
    if (rollbacks.length || (decreases.length && !allowed)) {
      error(`\n古い土台や収集失敗がないか確認し、データは最新mainを採用してください。`);
      error("正当な件数減・削除だけは、理由と [allow-data-regression] をコミットメッセージに記載できます。");
      return 1;
    }
    log(decreases.length ? "✔ [allow-data-regression] により件数減と削除を許可しました" : "✔ 巻き戻りなし");
    return 0;
  } catch (readError) {
    error(`✖ 比較データを確認できません: ${readError.message}`);
    error("比較先のコミット・全JSONと BASE..HEAD の履歴を取得し、不正なJSONを修正してください。");
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const readArg = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  process.exitCode = checkDataRegression({
    baseRef: readArg("--base", "origin/main"),
    tolerance: Number(readArg("--tolerance", "0.1"))
  });
}
