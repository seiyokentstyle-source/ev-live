#!/usr/bin/env node
// data/machines/**/*.json が「巻き戻っていないか」を確かめる。
//
// なぜ必要か:
//   期待値データは毎晩の収集で前へ進むだけの資産で、後ろへ動くことはない。
//   ところが git のマージ／リベースは、古い土台で作ったJSONを新しい main の上へ
//   持ってこられてしまう。実際に一度、8/22時点のCSVから再生成したJSONを
//   8/23ぶんが入った main へマージしかけ、1日ぶんが黙って消えるところだった。
//   make_evlive_data.py 側の「件数が大幅減なら上書きしない」ガードは再生成時にしか
//   効かず、この経路は素通りする。だからgitの側で止める。
//
// 判定（比較対象は既定で origin/main）:
//   ★ lastUpdated が古くなった      → 巻き戻し確定。データは前にしか進まない
//   ・機種のJSONが消えた            → 掲載中の機種がサイトから落ちる
//   ・サンプル件数が閾値を超えて減少 → 収集失敗ぶんで上書きした疑い
//
// 使い方:
//   node scripts/check-data-regression.mjs                 # origin/main と比べる
//   node scripts/check-data-regression.mjs --base <ref>    # 比較先を変える
//   node scripts/check-data-regression.mjs --tolerance 0.1 # 件数減少の許容（既定10%）
//
// 意図してデータを減らすとき（スペック変更で件数が正しく減る／獲得データ不良の機種を
// make_evlive_data.py が意図的に削除する等）は、コミットメッセージに
// [allow-data-regression] を入れると件数減と削除の判定を通せる。
// ★lastUpdated の巻き戻りだけはこの合図でも通さない。
//   「意図してデータを古くする」場面が無く、あるとすれば事故だから。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = readArg("--base", "origin/main");
const TOLERANCE = Number(readArg("--tolerance", "0.1"));
const DIR = "data/machines";

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 });

/** base 側に存在するファイル一覧（サブフォルダ＝店舗別も含む）。 */
function baseFiles() {
  try {
    return git("ls-tree", "-r", "--name-only", BASE, "--", DIR)
      .split("\n")
      .filter((f) => f.endsWith(".json"));
  } catch (e) {
    console.error(`✖ 比較先 ${BASE} を読めません: ${e.message}`);
    console.error("  CI では fetch-depth: 0 が要ります。ローカルなら git fetch origin main を先に。");
    process.exit(2);
  }
}

function readAt(ref, file) {
  try {
    return JSON.parse(git("show", `${ref}:${file}`));
  } catch {
    return null; // その ref に無い＝新規追加 or 削除
  }
}

function readHead(file) {
  // 作業ツリーを見る（コミット前でも確認できるようにする）。
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null; // 消えている
  }
}

const samplesOf = (d) => {
  const raw = d?.meta?.samples;
  if (raw === undefined || raw === null) return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

function allowedByCommitMessage() {
  try {
    // マージコミットの場合も含め、base..HEAD の全メッセージを見る。
    const log = git("log", "--format=%B", `${BASE}..HEAD`);
    return log.includes("[allow-data-regression]");
  } catch {
    return false;
  }
}

const 巻き戻し = [];   // lastUpdated が古くなった（合図でも通さない）
const 減少 = [];       // 件数が減った／機種が消えた（合図で通せる）

for (const file of baseFiles()) {
  const base = readAt(BASE, file);
  const head = readHead(file);
  const name = base?.name ?? file;

  if (!head) {
    // 獲得データ不良の機種は make_evlive_data.py が意図的にJSONを消す。
    // 事故と正当な削除を機械では区別できないので、合図で通せる側に置く。
    減少.push(`${name}: JSONが消えている（${file}）`);
    continue;
  }
  const bU = base?.lastUpdated;
  const hU = head?.lastUpdated;
  if (bU && hU && hU < bU) {
    巻き戻し.push(`${name}: lastUpdated ${bU} → ${hU}（古くなっている）`);
  }
  const bN = samplesOf(base);
  const hN = samplesOf(head);
  if (bN !== null && hN !== null && bN > 0 && hN < bN * (1 - TOLERANCE)) {
    const pct = (((bN - hN) / bN) * 100).toFixed(1);
    減少.push(`${name}: サンプル ${bN.toLocaleString()} → ${hN.toLocaleString()}（-${pct}%）`);
  }
}

const 許可 = allowedByCommitMessage();
console.log(`データ巻き戻りチェック: ${BASE} と比較 / 許容 ${(TOLERANCE * 100).toFixed(0)}%`);

if (巻き戻し.length === 0 && 減少.length === 0) {
  console.log("✔ 巻き戻りなし");
  process.exit(0);
}

if (巻き戻し.length) {
  console.error(`\n✖ 巻き戻し ${巻き戻し.length}件（[allow-data-regression] でも通しません）`);
  for (const m of 巻き戻し) console.error(`   ${m}`);
}
if (減少.length) {
  const 印 = 許可 ? "許可済み" : "✖";
  console.error(`\n${印} データの減少 ${減少.length}件`);
  for (const m of 減少) console.error(`   ${m}`);
}

if (巻き戻し.length || (減少.length && !許可)) {
  console.error(`
どうするか:
  ・古い土台で再生成したJSONを新しい main へ載せようとしていないか確認する。
    その場合は data/ を main 側に合わせ、コードの変更だけを残す:
      git checkout ${BASE} -- ${DIR}
  ・収集の失敗で件数が減ったのなら、取り直してから再生成する。
  ・スペック変更で正しく減る、獲得データ不良の機種を外した等の正当な理由なら、
    コミットメッセージに [allow-data-regression] を入れて理由も書く
    （件数減と削除は通ります。lastUpdated の巻き戻りは通りません）。`);
  process.exit(1);
}
console.log("\n✔ [allow-data-regression] があるため、件数減と削除は許可しました");
process.exit(0);
