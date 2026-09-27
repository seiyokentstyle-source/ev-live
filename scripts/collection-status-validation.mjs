import { isDate } from "./data-date-compatibility.mjs";

export const COLLECTION_STATUS_PATH = /^data\/halls\/([a-z0-9][a-z0-9_-]{0,31})\/collection-status\.json$/;
const REASONS = new Set([
  "sample_insufficient", "payout_unavailable", "spec_unverified",
  "collection_incomplete", "signal_unverified", "validation_pending"
]);
const COUNTS = ["rows", "events", "units", "days"];
const own = (value, key) => Object.hasOwn(value, key);

function fail(label, message) { throw new Error(`${label}: ${message}`); }
function object(value, keys, label, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(label, "オブジェクトではありません");
  if (keys.some(key => !own(value, key) && !optional.includes(key)) || Object.keys(value).some(key => !keys.includes(key))) {
    fail(label, "収集状況のフィールドが不足または未定義です");
  }
}
function text(value, label) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) fail(label, "空でない文字列が必要です");
}
function count(value, minimum, label) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(label, "有効な整数件数ではありません");
}

/** Only aggregate observations belong here; unknown fields fail closed. */
export function parseCollectionStatus(raw, label, file = label) {
  let data;
  try { data = JSON.parse(raw); }
  catch { fail(label, "収集状況JSONを解析できません"); }
  object(data, ["schema", "hallId", "lastUpdated", "source", "storeId", "machines"], label);
  const match = COLLECTION_STATUS_PATH.exec(file);
  if (!match || data.hallId !== match[1] || data.schema !== "evlive-collection-status/v1"
      || data.source !== "daidata" || typeof data.storeId !== "string" || !/^\d{6}$/.test(data.storeId)) {
    fail(label, "収集状況の形式・店舗・取得元が一致しません");
  }
  if (!isDate(data.lastUpdated) || !Array.isArray(data.machines) || !data.machines.length) {
    fail(label, "収集状況の末日または機種一覧が不正です");
  }
  const ids = new Set();
  const identities = new Set();
  for (const entry of data.machines) {
    object(entry, ["id", "name", "manufacturer", "aliases", "releaseDate", "lastUpdated", "collection",
      "status", "reasonCode", "pendingReason", "forcePending", "collectionComplete", "expectedUnits", "sourceIntegrity"], label, ["expectedUnits"]);
    if (typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(entry.id) || ids.has(entry.id)) {
      fail(label, "機種idが不正または重複しています");
    }
    ids.add(entry.id);
    const context = `${label}:${entry.id}`;
    for (const key of ["name", "manufacturer", "pendingReason"]) text(entry[key], `${context}.${key}`);
    if (!Array.isArray(entry.aliases) || !entry.aliases.length || new Set(entry.aliases).size !== entry.aliases.length) {
      fail(context, "機種別名が不正または重複しています");
    }
    for (const alias of entry.aliases) text(alias, `${context}.aliases`);
    if (!entry.aliases.includes(entry.name)) fail(context, "機種名が別名一覧にありません");
    if (!isDate(entry.releaseDate) || !isDate(entry.lastUpdated) || entry.lastUpdated > data.lastUpdated) {
      fail(context, "機種の日付が不正です");
    }
    if (entry.status !== "pending" || !REASONS.has(entry.reasonCode)
        || typeof entry.forcePending !== "boolean" || typeof entry.collectionComplete !== "boolean") {
      fail(context, "収集状況・保留理由の形式が不正です");
    }
    // An interrupted catalog refresh can leave checksum-verified observations but
    // no verified current unit list. Unknown is omitted, never fabricated as 0.
    if (own(entry, "expectedUnits")) count(entry.expectedUnits, 1, `${context}.expectedUnits`);
    object(entry.collection, [...COUNTS, "firstDate", "lastDate"], `${context}.collection`);
    const collection = entry.collection;
    // A verified daily snapshot may prove collected units even with no signals.
    for (const key of COUNTS) count(collection[key], ["rows", "events"].includes(key) ? 0 : 1, `${context}.collection.${key}`);
    if (collection.events > collection.rows) fail(context, "信号件数が保存履歴行数を超えています");
    if (!isDate(collection.firstDate) || !isDate(collection.lastDate)
        || collection.firstDate > collection.lastDate || collection.lastDate !== entry.lastUpdated) {
      fail(context, "収集期間が不正です");
    }
    const calendarDays = (Date.parse(collection.lastDate) - Date.parse(collection.firstDate)) / 86_400_000 + 1;
    if (collection.days > calendarDays) fail(context, "収集日数が収集期間を超えています");
    object(entry.sourceIntegrity, ["schemaVersion", "hallId", "machineName", "targetDate", "inputSha256"], `${context}.sourceIntegrity`);
    const integrity = entry.sourceIntegrity;
    if (integrity.schemaVersion !== 1 || integrity.hallId !== data.hallId
        || !entry.aliases.includes(integrity.machineName) || identities.has(integrity.machineName)
        || integrity.targetDate !== entry.lastUpdated || typeof integrity.inputSha256 !== "string"
        || !/^[a-f0-9]{64}$/.test(integrity.inputSha256)) {
      fail(context, "収集元の機種・店舗・末日・ハッシュが一致しません");
    }
    identities.add(integrity.machineName);
  }
  if (data.lastUpdated !== data.machines.reduce((latest, entry) => entry.lastUpdated > latest ? entry.lastUpdated : latest, "")) {
    fail(label, "収集状況の末日が機種の最新観測日と一致しません");
  }
  return data;
}

/** Eligibility changes never erase the independent observation catalog. */
export function collectionStatusLosses(before, after, label) {
  const losses = [];
  for (const key of ["hallId", "source", "storeId"]) {
    if (before[key] !== after[key]) losses.push(`${label}: 収集元 ${key} が変更されています`);
  }
  if (after.lastUpdated < before.lastUpdated) losses.push(`${label}: 収集状況の末日が巻き戻っています`);
  const current = new Map(after.machines.map(entry => [entry.id, entry]));
  for (const entry of before.machines) {
    const next = current.get(entry.id);
    const name = `${label}:${entry.id}`;
    if (!next) { losses.push(`${name}: 収集済み機種が消えています`); continue; }
    if (next.name !== entry.name || next.sourceIntegrity.machineName !== entry.sourceIntegrity.machineName) {
      losses.push(`${name}: 収集元の機種が変更されています`);
    }
    if (entry.aliases.some(alias => !next.aliases.includes(alias))) losses.push(`${name}: 既存の機種別名が消えています`);
    if (next.lastUpdated < entry.lastUpdated) losses.push(`${name}: 機種の観測末日が巻き戻っています`);
    for (const key of COUNTS) {
      if (next.collection[key] < entry.collection[key]) {
        losses.push(`${name}: collection.${key} ${entry.collection[key]} → ${next.collection[key]}`);
      }
    }
    if (next.collection.firstDate > entry.collection.firstDate || next.collection.lastDate < entry.collection.lastDate) {
      losses.push(`${name}: 収集期間が短くなっています`);
    }
  }
  return losses;
}
