import { expect, test } from 'vitest';
import publishedHalls from '../../data/published-halls.json';
import { INTERVAL_HALLS, intervalHall, intervalHallForEvot } from '../lib/interval-halls.mjs';

test('every listed ready source hall has an explorer identity matching the published registry', () => {
  for (const hall of publishedHalls.filter(hall => hall.visibility !== 'mixed-only' && hall.ready)) {
    expect(intervalHall(hall.id), `Missing explorer identity for published hall ${hall.id}`).toEqual({
      id: hall.id, dataSubdir: hall.dataSubdir, name: hall.name, evotHallId: hall.id,
    });
    expect(intervalHallForEvot(hall.id)).toBe(intervalHall(hall.id));
  }
  for (const hall of publishedHalls.filter(hall => hall.visibility === 'mixed-only')) {
    expect(intervalHall(hall.id)).toBeUndefined();
    expect(intervalHallForEvot(hall.id)).toBeUndefined();
  }
});

test('source and display identities are unique and mixed stays uncorrected', () => {
  expect(new Set(INTERVAL_HALLS.map(hall => hall.id)).size).toBe(INTERVAL_HALLS.length);
  expect(new Set(INTERVAL_HALLS.map(hall => hall.evotHallId)).size).toBe(INTERVAL_HALLS.length);
  expect(intervalHall('mixed')?.evotHallId).toBe('mixed-raw');
  expect(intervalHallForEvot('mixed')).toBeUndefined();
  expect(intervalHallForEvot('mixed-raw')).toBe(intervalHall('mixed'));
});
