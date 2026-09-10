import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error build script intentionally uses the Node ESM runtime
import { exportIntervalFeed } from '../scripts/export-interval-feed.mjs';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
test('publishes the same revision and removes stale machine envelopes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'evlive-feed-')); roots.push(root);
  const source = path.join(root, 'source'), output = path.join(root, 'output'); await fs.mkdir(source);
  const base = { id: 'magia', name: 'マギア', available: true, lastUpdated: '2026-09-02' };
  const envelope = { schema: 'evlive-interval-envelope/v1', keyId: 'test', id: 'magia', hallId: 'shinjuku', lastUpdated: base.lastUpdated, dataFrom: '2026-08-01', rows: 10, sourceRevision: 'a'.repeat(64), algorithm: 'RSA-OAEP-256+A256GCM', encoding: 'gzip', wrappedKey: 'test', nonce: 'test', ciphertext: 'encrypted' };
  const file = path.join(source, 'magia.json');
  await fs.writeFile(file, JSON.stringify({ ...base, intervalExplorer: envelope, settingAim: { units: ['private'] } }));
  let index = await exportIntervalFeed(source, output);
  expect(index.machines[0]).toMatchObject({ ready: true, rows: 10, sourceRevision: envelope.sourceRevision });
  const published = await fs.readFile(path.join(output, 'shinjuku/magia.json'), 'utf8');
  expect(published).not.toContain('private'); expect(JSON.parse(published)).toEqual(envelope);
  await fs.writeFile(file, JSON.stringify({ ...base, lastUpdated: '2026-09-03', intervalExplorer: { ...envelope, lastUpdated: '2026-09-03', rows: 12, sourceRevision: 'b'.repeat(64) } }));
  index = await exportIntervalFeed(source, output);
  expect(index.machines[0]).toMatchObject({ lastUpdated: '2026-09-03', rows: 12 });
  await fs.writeFile(file, JSON.stringify(base)); await exportIntervalFeed(source, output);
  await expect(fs.stat(path.join(output, 'shinjuku/magia.json'))).rejects.toThrow();
  await fs.writeFile(file, JSON.stringify({ ...base, intervalExplorer: { ...envelope, lastUpdated: '2026-08-01' } }));
  await expect(exportIntervalFeed(source, output)).rejects.toThrow('Invalid encrypted');
});
