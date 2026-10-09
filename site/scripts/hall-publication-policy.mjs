import fs from 'node:fs/promises';

/** Publication affects generated outputs only; registry/source data stay intact. */
export async function hallPublicationPolicy(halls) {
  const registry = halls ?? JSON.parse(await fs.readFile(new URL('../../data/published-halls.json', import.meta.url), 'utf8'));
  if (!Array.isArray(registry)) throw new Error('Invalid published hall registry');
  for (const hall of registry) {
    if (typeof hall.id !== 'string' || typeof hall.dataSubdir !== 'string' ||
        (hall.visibility !== undefined && hall.visibility !== 'listed' && hall.visibility !== 'mixed-only')) {
      throw new Error('Invalid published hall visibility');
    }
  }
  const hidden = registry.filter(hall => hall.visibility === 'mixed-only');
  const ids = new Set(hidden.map(hall => hall.id));
  const subdirs = new Set(hidden.map(hall => hall.dataSubdir));
  return {
    isListedId: id => !ids.has(id),
    isListedSubdir: subdir => !subdirs.has(subdir),
  };
}
