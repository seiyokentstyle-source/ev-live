import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { externalizeMachineAggregations } from '../lib/filter-aggregate-assets.mjs';
import { splitCzThroughProfiles } from '../lib/cz-through-profiles.mjs';
import { inlineSourceAggregations, sourceAggregatesDir } from '../lib/source-aggregations.mjs';
import { hallPublicationPolicy } from './hall-publication-policy.mjs';

export async function exportFilterAggregates(sourceDir, outputDir, halls) {
  const source = path.resolve(sourceDir), output = path.resolve(outputDir);
  if (source === output || source.startsWith(output + path.sep) || output.startsWith(source + path.sep)) {
    throw new Error('Source and output must be separate');
  }
  await fs.mkdir(output, { recursive: true });
  const policy = await hallPublicationPolicy(halls);
  const emitted = new Set();
  let bytes = 0;
  const visit = async (directory) => {
    const entries = (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      // Only regular machine files and hall directories; never follow symlinks.
      if (entry.isDirectory()) {
        if (policy.isListedSubdir(path.relative(source, filename))) await visit(filename);
        continue;
      }
      if (!entry.isFile() || !/^[a-z0-9]+\.json$/.test(entry.name)) continue;
      // Rows the scraper stored beside the machine JSON are restored first, so the
      // checks and CZ cohort splitting below see exactly the same payload as before.
      let machine = inlineSourceAggregations(JSON.parse(await fs.readFile(filename, 'utf8')),
        sourceAggregatesDir(source));
      if (!Array.isArray(machine.profiles)) continue;
      if (directory === source && !policy.isListedSubdir('')) {
        // The root store also supplies legacy corrected-mixed fallbacks. Keep
        // those profiles without emitting the hidden store's measured tables.
        const profiles = machine.setting1Correction?.profiles ??
          ((machine.calcSpec?.items ?? []).some(item => item.k.includes('獲得は実測ではない'))
            ? machine.profiles : machine.profiles.filter(profile => profile.label.includes('設定1想定')));
        machine = { ...machine, profiles };
        delete machine.setting1Correction;
      }
      const profiles = [...machine.profiles, ...(machine.setting1Correction?.profiles ?? [])];
      if (profiles.some(profile => profile.evFilters?.aggregation?.rowsAsset ||
          Object.values(profile.evFilters?.tableAggregations ?? {}).some(data => data.rowsAsset))) {
        throw new Error(`Source aggregates must contain their row payload: ${entry.name}`);
      }
      const assets = new Map();
      externalizeMachineAggregations(splitCzThroughProfiles(machine), (hash, body) => {
        if (!emitted.has(hash)) assets.set(hash, body);
      });
      for (const [hash, body] of assets) {
        await fs.writeFile(path.join(output, `${hash}.json`), body, 'utf8');
        bytes += Buffer.byteLength(body, 'utf8');
        emitted.add(hash);
      }
    }
  };
  await visit(source);
  // These are generated assets only. Delete obsolete hash files, never inputs.
  for (const entry of await fs.readdir(output, { withFileTypes: true })) {
    if (entry.isFile() && /^[a-f0-9]{64}\.json$/.test(entry.name) && !emitted.has(entry.name.slice(0, -5))) {
      await fs.unlink(path.join(output, entry.name));
    }
  }
  return { assets: emitted.size, bytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const site = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const result = await exportFilterAggregates(path.join(site, '..', 'data', 'machines'), path.join(site, 'public', 'filter-aggregates'));
  console.log(`Filter aggregates: ${result.assets} assets, ${result.bytes} bytes (loaded on demand)`);
}
