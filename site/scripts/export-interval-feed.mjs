import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function exportIntervalFeed(sourceDir, outputDir) {
  const source = path.resolve(sourceDir), output = path.resolve(outputDir);
  if (source === output || source.startsWith(output + path.sep) || output.startsWith(source + path.sep)) throw new Error('Source and output must be separate');
  const machines = [], payloads = new Map();
  for (const file of (await fs.readdir(source)).filter((f) => /^[a-z0-9]+\.json$/.test(f)).sort()) {
    const data = JSON.parse(await fs.readFile(path.join(source, file), 'utf8'));
    if (!data.available) continue;
    if (file !== `${data.id}.json` || typeof data.name !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.lastUpdated)) throw new Error(`Invalid machine ${file}`);
    const e = data.intervalExplorer;
    const item = { id: data.id, machine: data.name, hallId: 'shinjuku', lastUpdated: data.lastUpdated, ready: false };
    if (e) {
      if (e.schema !== 'evlive-interval-envelope/v1' || e.id !== data.id || e.hallId !== 'shinjuku' || e.lastUpdated !== data.lastUpdated ||
          !Number.isSafeInteger(e.rows) || e.rows < 0 || !/^[a-f0-9]{64}$/.test(e.sourceRevision) ||
          e.algorithm !== 'RSA-OAEP-256+A256GCM' || e.encoding !== 'gzip' ||
          !['keyId', 'wrappedKey', 'nonce', 'ciphertext'].every((k) => typeof e[k] === 'string' && e[k].length > 0)) throw new Error(`Invalid encrypted explorer ${file}`);
      // Explicit allowlist: no source rows or other machine fields in the feed.
      const keys = ['schema', 'keyId', 'id', 'hallId', 'lastUpdated', 'dataFrom', 'rows', 'sourceRevision', 'algorithm', 'encoding', 'wrappedKey', 'nonce', 'ciphertext'];
      payloads.set(file, JSON.stringify(Object.fromEntries(keys.map((k) => [k, e[k]]))));
      Object.assign(item, { ready: true, sourceRevision: e.sourceRevision, rows: e.rows, dataFrom: e.dataFrom });
    }
    machines.push(item);
  }
  const target = path.join(output, 'shinjuku');
  await fs.mkdir(target, { recursive: true });
  for (const file of await fs.readdir(target)) {
    if (/^[a-z0-9]+\.json$/.test(file) && !payloads.has(file)) await fs.unlink(path.join(target, file));
  }
  for (const [file, value] of payloads) await fs.writeFile(path.join(target, file), value);
  const index = { schema: 'evlive-interval-feed/v1', machines };
  await fs.writeFile(path.join(output, 'index.json'), JSON.stringify(index));
  return index;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const site = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const index = await exportIntervalFeed(path.join(site, '..', 'data', 'machines'), path.join(site, 'public', 'interval-feed'));
  console.log(`Interval feed: ${index.machines.filter((m) => m.ready).length}/${index.machines.length} connected machines`);
}
