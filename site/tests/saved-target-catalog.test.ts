import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { getSavedTargetSnapshot } from '../lib/saved-target-catalog';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

test('reads a mixed target from the mixed source only for the mixed-raw display', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'evlive-target-source-')); roots.push(root);
  const dir = path.join(root, 'data', 'machines', 'mixed'); await fs.mkdir(dir, { recursive: true });
  const refresh = { id: '7de93a9e-0830-4995-a6dc-8e8bfb451460', conditionKey: 'a'.repeat(64), sourceRevision: 'b'.repeat(64), dataThrough: '2026-10-15', rows: [{ g: 100, ev: 12, n: 30, days: 5 }] };
  const machine = { id: 'test', lastUpdated: refresh.dataThrough, savedTargets: [refresh], intervalExplorer: {
    schema: 'evlive-interval-envelope/v1', id: 'test', hallId: 'mixed', lastUpdated: refresh.dataThrough, sourceRevision: refresh.sourceRevision,
  } };
  const file = path.join(dir, 'test.json'); await fs.writeFile(file, JSON.stringify(machine));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  expect(await getSavedTargetSnapshot('test', 'mixed-raw', 'mixed-raw')).toEqual({ refreshed: [refresh], replaySource: refresh.sourceRevision });
  expect(await getSavedTargetSnapshot('test', 'mixed', 'mixed')).toEqual({ refreshed: [], replaySource: null });
  await expect(getSavedTargetSnapshot('test', 'mixed', 'kabuki')).rejects.toThrow('hall directory mismatch');
  await fs.writeFile(file, JSON.stringify({ ...machine, id: 'other' }));
  await expect(getSavedTargetSnapshot('test', 'mixed-raw', 'mixed-raw')).rejects.toThrow('machine mismatch');
});
