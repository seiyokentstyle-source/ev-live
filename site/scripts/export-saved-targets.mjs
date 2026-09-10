import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSavedTargetCatalog } from '../lib/saved-targets.mjs';

export async function exportSavedTargets(source, output) {
  if (path.resolve(source) === path.resolve(output)) throw new Error('Source and output must be separate');
  const catalog = parseSavedTargetCatalog(JSON.parse(await fs.readFile(source, 'utf8')));
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(catalog));
  return catalog;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const site = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const catalog = await exportSavedTargets(path.join(site, '..', 'data', 'saved-targets', 'targets.json'), path.join(site, 'public', 'saved-targets.json'));
  console.log(`Saved targets: ${catalog.targets.length} published`);
}
