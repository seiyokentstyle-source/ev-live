import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../app/preview/ev-table/machine.json';
import { validateMachine } from '../lib/ev/validate';
import { getMachine } from '../lib/machines';
import { getSavedTargetCatalog, getSavedTargetSnapshot } from '../lib/saved-target-catalog';
import { buildLiveMachine } from '../lib/live-data';
import type { PublishedTarget, SavedTargetCatalog } from '../lib/saved-targets.mjs';
import MachineDetailPage from '../app/machines/[id]/[hall]/page';

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not found'); } }));
vi.mock('../lib/machines', () => ({ getMachine: vi.fn(), getMachines: vi.fn(), getAvailableMachines: vi.fn() }));
vi.mock('../lib/saved-target-catalog', () => ({ getSavedTargetCatalog: vi.fn(), getSavedTargetSnapshot: vi.fn() }));
vi.mock('../app/machines/[id]/MachineDetailClient', () => ({ MachineDetailClient: () => null }));
vi.mock('../app/machines/[id]/[hall]/HallPendingClient', () => ({ HallPendingClient: () => null }));

const target: PublishedTarget = {
  id: '7de93a9e-0830-4995-a6dc-8e8bfb451460', name: '任意で付けた狙い目名',
  machineId: fixture.id, hallId: 'shinjuku', machine: fixture.name,
  conditionKey: 'a'.repeat(64), publicationKey: 'b'.repeat(64), sourceRevision: 'c'.repeat(64),
  dataThrough: '2026-09-03', updatedAt: '2026-09-11T01:00:00.000Z',
  definition: { schema: 'interval-target/v1', machineId: fixture.id, hallId: 'shinjuku',
    profileKey: 'at_5050', startG: 100, endG: null, filters: {}, rate: '50/50', stopRule: 'evlive' },
  profile: '通常・等価', rate: '50/50', conditions: '', stopping: '当選後終了',
  rows: [{ g: 100, n: 20, days: 4, ev: 1200 }],
};
const catalog: SavedTargetCatalog = { schema: 'evlive-saved-targets/v1', updatedAt: target.updatedAt, targets: [target] };
const renderPage = () => MachineDetailPage({ params: Promise.resolve({ id: fixture.id, hall: 'shinjuku' }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMachine).mockResolvedValue(validateMachine(fixture));
  vi.mocked(getSavedTargetCatalog).mockResolvedValue(catalog);
  vi.mocked(getSavedTargetSnapshot).mockResolvedValue({ refreshed: [], replaySource: target.sourceRevision });
});

describe('static machine page saved-target source', () => {
  it('passes the source revision through after the machine envelope was stripped', async () => {
    const page = await renderPage();
    expect(page.props.savedTargets).toHaveLength(1);
    expect(page.props.savedTargets[0]).toMatchObject({ name: target.name, rate: '50/50', refreshed: false });
    expect(getSavedTargetSnapshot).toHaveBeenCalledWith(fixture.id, '', 'shinjuku');
    expect(page.props.machine).not.toHaveProperty('intervalExplorer');
    const snapshot = buildLiveMachine(validateMachine(fixture), 'shinjuku', catalog, [], target.sourceRevision);
    expect(page.props.revision).toBe(snapshot.revision);
  });

  it('hides skipped prior calculations after an EVLIVE source update', async () => {
    const current = await renderPage();
    vi.mocked(getSavedTargetSnapshot).mockResolvedValue({ refreshed: [], replaySource: 'd'.repeat(64) });
    const updated = await renderPage();
    expect(updated.props.savedTargets).toEqual([]);
    expect(updated.props.revision).not.toBe(current.props.revision);
  });

  it('uses matching refreshed calculations while retaining the manually published identity', async () => {
    const refreshed = { id: target.id, conditionKey: target.conditionKey,
      sourceRevision: 'd'.repeat(64), dataThrough: '2026-09-04', rows: [{ g: 100, ev: 1500, n: 30, days: 5 }] };
    vi.mocked(getSavedTargetSnapshot).mockResolvedValue({ refreshed: [refreshed], replaySource: refreshed.sourceRevision });
    const result = (await renderPage()).props.savedTargets[0];
    expect(result).toMatchObject({ name: target.name, publicationKey: target.publicationKey, rate: '50/50',
      sourceRevision: refreshed.sourceRevision, rows: refreshed.rows, refreshed: true });
  });
});
