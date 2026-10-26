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
  const sourceBefore = await fs.readFile(file, 'utf8');
  const hidden = await exportIntervalFeed(source, output, [{ id: 'shinjuku', dataSubdir: '', visibility: 'mixed-only' }]);
  expect(hidden.machines).toEqual([]);
  expect(await fs.readdir(path.join(output, 'shinjuku'))).toEqual([]);
  expect(await fs.readFile(file, 'utf8')).toBe(sourceBefore);
  await fs.writeFile(file, JSON.stringify({ ...base, lastUpdated: '2026-09-03', intervalExplorer: { ...envelope, lastUpdated: '2026-09-03', rows: 12, sourceRevision: 'b'.repeat(64) } }));
  index = await exportIntervalFeed(source, output);
  expect(index.machines[0]).toMatchObject({ lastUpdated: '2026-09-03', rows: 12 });
  await fs.writeFile(file, JSON.stringify(base)); await exportIntervalFeed(source, output);
  await expect(fs.stat(path.join(output, 'shinjuku/magia.json'))).rejects.toThrow();
  await fs.writeFile(file, JSON.stringify({ ...base, intervalExplorer: { ...envelope, lastUpdated: '2026-08-01' } }));
  await expect(exportIntervalFeed(source, output)).rejects.toThrow('Invalid encrypted');
});

const feedMachine = (hallId: string, revision = 'a') => ({
  id: 'magia', name: 'マギア', available: true, lastUpdated: '2026-10-15',
  profiles: [{ baseAnchors: [{ g: 100, ev: 12, n: 30 }] }],
  intervalExplorer: { schema: 'evlive-interval-envelope/v1', keyId: 'test', id: 'magia', hallId,
    lastUpdated: '2026-10-15', dataFrom: '2026-08-01', rows: 10, sourceRevision: revision.repeat(64),
    algorithm: 'RSA-OAEP-256+A256GCM', encoding: 'gzip', wrappedKey: 'test', nonce: 'test', ciphertext: `encrypted-${hallId}` },
});
async function feedFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'evlive-multihall-')); roots.push(root);
  const source = path.join(root, 'source'), output = path.join(root, 'output'); await fs.mkdir(source);
  const write = async (subdir: string, data: unknown) => {
    await fs.mkdir(path.join(source, subdir), { recursive: true });
    await fs.writeFile(path.join(source, subdir, 'magia.json'), JSON.stringify(data));
  };
  const v2 = async () => JSON.parse(await fs.readFile(path.join(output, 'index-v2.json'), 'utf8'));
  return { source, output, write, v2 };
}

test('keeps v1 unchanged and separates the same machine in four source halls', async () => {
  const { source, output, write, v2 } = await feedFixture();
  const original = new Map<string, string>();
  const halls = [['shinjuku', '', 'a'], ['kabuki', 'kabuki', 'b'], ['mixed', 'mixed', 'c'], ['akihabara', 'akihabara', 'd']];
  for (const [hall, subdir, revision] of halls) {
    const data = feedMachine(hall, revision);
    await write(subdir, data); original.set(subdir, JSON.stringify(data));
  }
  const legacy = await exportIntervalFeed(source, output, []);
  expect(legacy).toEqual({ schema: 'evlive-interval-feed/v1', machines: [{
    id: 'magia', machine: 'マギア', hallId: 'shinjuku', lastUpdated: '2026-10-15', ready: true,
    sourceRevision: 'a'.repeat(64), rows: 10, dataFrom: '2026-08-01',
  }] });
  const index = await v2();
  expect(index.schema).toBe('evlive-interval-feed/v2');
  expect(index.halls.find((hall: { id: string }) => hall.id === 'mixed')).toEqual({ id: 'mixed', name: '店舗混合（補正なし）', evotHallId: 'mixed-raw' });
  expect(index.machines.map((item: { hallId: string }) => item.hallId)).toEqual(['shinjuku', 'kabuki', 'mixed', 'akihabara']);
  expect(index.halls.find((hall: { id: string }) => hall.id === 'akihabara')).toEqual({ id: 'akihabara', name: '萌えスロのお店', evotHallId: 'akihabara' });
  for (const [hall, subdir, revision] of halls) {
    const envelope = JSON.parse(await fs.readFile(path.join(output, hall, 'magia.json'), 'utf8'));
    expect(envelope).toEqual(feedMachine(hall, revision).intervalExplorer);
    expect(await fs.readFile(path.join(source, subdir, 'magia.json'), 'utf8')).toBe(original.get(subdir));
  }
});

test('never reads hidden hall sources and withdraws previously generated hidden envelopes', async () => {
  const { source, output, write, v2 } = await feedFixture();
  await write('', feedMachine('shinjuku'));
  await write('mixed', feedMachine('mixed'));
  const hidden = ['akiba_espace', 'seibu_shinjuku', 'ueno_honkan', 'ueno_shinkan', 'espace_shibuya_shinkan'];
  for (const hall of hidden) {
    await write(hall, { private: 'malformed source must not be read' });
    await fs.mkdir(path.join(output, hall), { recursive: true });
    await fs.writeFile(path.join(output, hall, 'magia.json'), 'stale encrypted payload');
  }
  await exportIntervalFeed(source, output, hidden.map(id => ({ id, dataSubdir: id, visibility: 'mixed-only' })));
  expect((await v2()).machines.map((item: { hallId: string }) => item.hallId)).toEqual(['shinjuku', 'mixed']);
  for (const hall of hidden) await expect(fs.stat(path.join(output, hall, 'magia.json'))).rejects.toThrow();
});

test.each(['kabuki', 'akihabara'])('withdraws %s when its publication policy changes without changing its source', async hallId => {
  const { source, output, write, v2 } = await feedFixture();
  const original = feedMachine(hallId);
  await write(hallId, original);
  for (const policy of [{ visibility: 'listed', ready: false }, { visibility: 'mixed-only', ready: true }]) {
    await exportIntervalFeed(source, output, []);
    expect((await v2()).machines).toHaveLength(1);
    await exportIntervalFeed(source, output, [{ id: hallId, dataSubdir: hallId, ...policy }]);
    expect((await v2()).machines).toEqual([]);
    expect((await v2()).halls.some((hall: { id: string }) => hall.id === hallId)).toBe(false);
    await expect(fs.stat(path.join(output, hallId, 'magia.json'))).rejects.toThrow();
    expect(await fs.readFile(path.join(source, hallId, 'magia.json'), 'utf8')).toBe(JSON.stringify(original));
  }
});

test.each(['missing_envelope', 'counter_unverified', 'unsupported_replay', 'encryption_key_unavailable', 'model_too_large'])('publishes a bounded unavailable reason: %s', async reason => {
  const { source, output, write, v2 } = await feedFixture();
  const { intervalExplorer: _envelope, ...base } = feedMachine('shinjuku');
  await write('', { ...base, ...(reason === 'missing_envelope' ? {} : { intervalExplorerStatus: {
    schema: 'interval-explorer-status/v1', id: base.id, hallId: 'shinjuku', lastUpdated: base.lastUpdated,
    ready: false, reason, detail: 'private diagnostic',
  } }) });
  const legacy = await exportIntervalFeed(source, output, []);
  expect(legacy.machines[0]).toEqual({ id: base.id, machine: base.name, hallId: 'shinjuku', lastUpdated: base.lastUpdated, ready: false });
  expect((await v2()).machines[0]).toEqual({ ...legacy.machines[0], reason });
  expect(JSON.stringify(await v2())).not.toContain('private');
  await expect(fs.stat(path.join(output, 'shinjuku', 'magia.json'))).rejects.toThrow();
});

test.each([
  { hallId: 'shinjuku' }, { id: 'other' }, { lastUpdated: '2026-10-14' },
  { dataFrom: '2026-10-16' }, { dataFrom: '2026-02-30' }, { sourceRevision: 'bad' }, { sourceRevision: ['a'.repeat(64)] }, { schema: 'future' },
])('rejects an inconsistent envelope before changing published outputs: %j', async patch => {
  const { source, output, write } = await feedFixture();
  const base = feedMachine('kabuki');
  await write('kabuki', base); await exportIntervalFeed(source, output, []);
  const before = await fs.readFile(path.join(output, 'index-v2.json'), 'utf8');
  await write('kabuki', { ...base, intervalExplorer: { ...base.intervalExplorer, ...patch } });
  await expect(exportIntervalFeed(source, output, [])).rejects.toThrow('Invalid encrypted');
  expect(await fs.readFile(path.join(output, 'index-v2.json'), 'utf8')).toBe(before);
});

test('checks the optional producer status against its exact envelope revision', async () => {
  const { source, output, write, v2 } = await feedFixture();
  const base = feedMachine('kabuki');
  const status = { schema: 'interval-explorer-status/v1', id: base.id, hallId: 'kabuki', lastUpdated: base.lastUpdated, ready: true, sourceRevision: base.intervalExplorer.sourceRevision };
  await write('kabuki', { ...base, intervalExplorerStatus: status });
  await exportIntervalFeed(source, output, []); expect((await v2()).machines[0].ready).toBe(true);
  for (const patch of [{ sourceRevision: 'b'.repeat(64) }, { hallId: 'shinjuku' }, { lastUpdated: '2026-10-14' }, { ready: false, reason: 'counter_unverified' }]) {
    await write('kabuki', { ...base, intervalExplorerStatus: { ...status, ...patch } });
    await expect(exportIntervalFeed(source, output, [])).rejects.toThrow('Invalid encrypted');
  }
});

test('does not leave an old envelope when the same machine becomes unavailable', async () => {
  const { source, output, write, v2 } = await feedFixture();
  const base = feedMachine('kabuki');
  await write('kabuki', base); await exportIntervalFeed(source, output, []);
  await write('kabuki', { ...base, available: false }); await exportIntervalFeed(source, output, []);
  expect((await v2()).machines).toEqual([]);
  await expect(fs.stat(path.join(output, 'kabuki', 'magia.json'))).rejects.toThrow();
});

test('fails if the whole source directory is missing instead of publishing an empty feed', async () => {
  const { source, output, write } = await feedFixture();
  await write('', feedMachine('shinjuku')); await exportIntervalFeed(source, output, []);
  const before = await fs.readFile(path.join(output, 'index-v2.json'), 'utf8');
  await expect(exportIntervalFeed(path.join(source, 'missing'), output, [])).rejects.toThrow();
  expect(await fs.readFile(path.join(output, 'index-v2.json'), 'utf8')).toBe(before);
});
