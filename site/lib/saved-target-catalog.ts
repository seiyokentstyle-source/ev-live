import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { parseMachineSavedTargets, parseSavedTargetCatalog } from './saved-targets.mjs';

export async function getSavedTargetCatalog() {
  const paths = [path.join(process.cwd(), 'data', 'saved-targets', 'targets.json'), path.join(process.cwd(), '..', 'data', 'saved-targets', 'targets.json')];
  const file = paths.find(candidate => existsSync(candidate));
  if (!file) throw new Error('Saved target catalog is missing');
  return parseSavedTargetCatalog(JSON.parse(await fs.readFile(file, 'utf8')));
}

/** Kept on the server: only current catalog members reach a client page. */
export async function getSavedTargetRefreshes(machineId: string, dataSubdir = '') {
  if (!/^[a-z0-9]{1,40}$/.test(machineId) || (dataSubdir && !/^[a-z0-9_-]+$/.test(dataSubdir))) throw new Error('Invalid saved target source');
  const roots = [path.join(process.cwd(), 'data', 'machines'), path.join(process.cwd(), '..', 'data', 'machines')];
  const root = roots.find(candidate => existsSync(candidate));
  if (!root) throw new Error('Machine data is missing');
  const machine = JSON.parse(await fs.readFile(path.join(root, dataSubdir, `${machineId}.json`), 'utf8'));
  return machine.savedTargets === undefined ? [] : parseMachineSavedTargets(machine.savedTargets);
}
