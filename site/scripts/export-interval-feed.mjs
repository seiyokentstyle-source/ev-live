import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hallPublicationPolicy } from './hall-publication-policy.mjs';
import { INTERVAL_HALLS } from '../lib/interval-halls.mjs';

const machineFile = /^[a-z0-9]{1,40}\.json$/;
const hallId = /^[a-z0-9][a-z0-9_-]*$/;
const hash = /^[a-f0-9]{64}$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const unavailableReasons = new Set(['counter_unverified', 'unsupported_replay', 'encryption_key_unavailable', 'model_too_large', 'missing_envelope']);
const envelopeKeys = ['schema', 'keyId', 'id', 'hallId', 'lastUpdated', 'dataFrom', 'rows', 'sourceRevision', 'algorithm', 'encoding', 'wrappedKey', 'nonce', 'ciphertext'];

function feedItem(data, file, hall) {
  if (!record(data) || typeof data.id !== 'string' || file !== `${data.id}.json` || typeof data.name !== 'string' || !data.name.trim() || !date(data.lastUpdated)) {
    throw new Error(`Invalid machine ${hall.id}/${file}`);
  }
  const e = data.intervalExplorer, status = data.intervalExplorerStatus;
  const invalid = () => { throw new Error(`Invalid encrypted explorer ${hall.id}/${file}`); };
  if (status !== undefined && (!record(status) || status.schema !== 'interval-explorer-status/v1' ||
      status.id !== data.id || status.hallId !== hall.id || status.lastUpdated !== data.lastUpdated ||
      typeof status.ready !== 'boolean')) invalid();
  const item = { id: data.id, machine: data.name, hallId: hall.id, lastUpdated: data.lastUpdated, ready: false };
  if (e !== undefined) {
    if (!record(e) || e.schema !== 'evlive-interval-envelope/v1' || e.id !== data.id || e.hallId !== hall.id || e.lastUpdated !== data.lastUpdated ||
        !date(e.dataFrom) || e.dataFrom > e.lastUpdated || !Number.isSafeInteger(e.rows) || e.rows < 0 || typeof e.sourceRevision !== 'string' || !hash.test(e.sourceRevision) ||
        e.algorithm !== 'RSA-OAEP-256+A256GCM' || e.encoding !== 'gzip' ||
        !['keyId', 'wrappedKey', 'nonce', 'ciphertext'].every(key => typeof e[key] === 'string' && e[key].trim().length > 0) ||
        status !== undefined && (status.ready !== true || status.sourceRevision !== e.sourceRevision)) invalid();
    Object.assign(item, { ready: true, sourceRevision: e.sourceRevision, rows: e.rows, dataFrom: e.dataFrom });
    // No source rows, status detail, or other machine fields cross this boundary.
    return { item, payload: JSON.stringify(Object.fromEntries(envelopeKeys.map(key => [key, e[key]]))) };
  }
  if (status !== undefined && (status.ready !== false || !unavailableReasons.has(status.reason) || status.sourceRevision !== undefined)) invalid();
  item.reason = status?.reason ?? 'missing_envelope';
  return { item };
}

async function entries(dir) {
  try { return await fs.readdir(dir, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

export async function exportIntervalFeed(sourceDir, outputDir, halls) {
  const source = path.resolve(sourceDir), output = path.resolve(outputDir);
  if (source === output || source.startsWith(output + path.sep) || output.startsWith(source + path.sep)) throw new Error('Source and output must be separate');
  if (!(await fs.stat(source)).isDirectory()) throw new Error('Machine source directory is missing');
  const policy = await hallPublicationPolicy(halls);
  const visible = INTERVAL_HALLS.filter(hall => policy.isListedId(hall.id) && policy.isListedId(hall.evotHallId) &&
    policy.isListedSubdir(hall.dataSubdir) && policy.isReadyId(hall.id) && policy.isReadyId(hall.evotHallId));
  const machines = [], payloads = new Map();
  // Validate every included source before touching any generated output.
  for (const hall of visible) {
    const dir = path.join(source, hall.dataSubdir);
    const files = (await entries(dir)).filter(entry => entry.isFile() && machineFile.test(entry.name)).map(entry => entry.name).sort();
    for (const file of files) {
      const data = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
      if (!data.available) continue;
      const { item, payload } = feedItem(data, file, hall);
      machines.push(item);
      if (payload !== undefined) payloads.set(`${hall.id}/${file}`, payload);
    }
  }
  await fs.mkdir(output, { recursive: true });
  // Remove obsolete envelopes, including a hall that has since become hidden.
  const outputHalls = new Set(INTERVAL_HALLS.map(hall => hall.id));
  for (const entry of await entries(output)) {
    if (hallId.test(entry.name) && (entry.isDirectory() || entry.isSymbolicLink())) outputHalls.add(entry.name);
  }
  for (const id of outputHalls) {
    const target = path.join(output, id);
    try { if ((await fs.lstat(target)).isSymbolicLink()) throw new Error('Invalid feed output directory'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.mkdir(target, { recursive: true });
    for (const entry of await entries(target)) {
      if (machineFile.test(entry.name) && entry.isSymbolicLink()) throw new Error('Invalid feed output file');
      if (machineFile.test(entry.name) && !payloads.has(`${id}/${entry.name}`)) await fs.unlink(path.join(target, entry.name));
    }
  }
  for (const [file, value] of payloads) await fs.writeFile(path.join(output, file), value);
  const v2 = { schema: 'evlive-interval-feed/v2', halls: visible.map(({ id, name, evotHallId }) => ({ id, name, evotHallId })), machines };
  await fs.writeFile(path.join(output, 'index-v2.json'), JSON.stringify(v2));
  // Keep the legacy schema, hall scope and item fields exactly as before.
  const index = { schema: 'evlive-interval-feed/v1', machines: machines.filter(item => item.hallId === 'shinjuku').map(({ reason, ...item }) => item) };
  await fs.writeFile(path.join(output, 'index.json'), JSON.stringify(index));
  return index;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const site = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const index = await exportIntervalFeed(path.join(site, '..', 'data', 'machines'), path.join(site, 'public', 'interval-feed'));
  console.log(`Legacy interval feed: ${index.machines.filter(machine => machine.ready).length}/${index.machines.length} connected machines; multi-hall feed: index-v2.json`);
}
