import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { parseMachineSavedTargets, parseSavedTargetCatalog, savedTargetReplaySource } from './saved-targets.mjs';
import { getHall, isListedHall } from './halls';
import { intervalHall, intervalHallForEvot } from './interval-halls.mjs';

export async function getSavedTargetCatalog() {
  const paths = [path.join(process.cwd(), 'data', 'saved-targets', 'targets.json'), path.join(process.cwd(), '..', 'data', 'saved-targets', 'targets.json')];
  const file = paths.find(candidate => existsSync(candidate));
  if (!file) throw new Error('Saved target catalog is missing');
  const catalog = parseSavedTargetCatalog(JSON.parse(await fs.readFile(file, 'utf8')));
  return { ...catalog, targets: catalog.targets.filter(target => {
    const source = intervalHall(target.hallId);
    return source && isListedHall(getHall(source.id)) && isListedHall(getHall(source.evotHallId));
  }) };
}

/** Kept on the server: only current catalog members reach a client page. */
export async function getSavedTargetSnapshot(machineId: string, dataSubdir = '', hallId = 'shinjuku') {
  const source = intervalHallForEvot(hallId);
  if (!source || !isListedHall(getHall(hallId)) || !isListedHall(getHall(source.id))) return { refreshed: [], replaySource: null };
  if (!/^[a-z0-9]{1,40}$/.test(machineId) || (dataSubdir && !/^[a-z0-9_-]+$/.test(dataSubdir))) throw new Error('Invalid saved target source');
  if (dataSubdir !== getHall(hallId)?.dataSubdir) throw new Error('Saved target hall directory mismatch');
  const roots = [path.join(process.cwd(), 'data', 'machines'), path.join(process.cwd(), '..', 'data', 'machines')];
  const root = roots.find(candidate => existsSync(candidate));
  if (!root) throw new Error('Machine data is missing');
  const file = path.join(root, source.dataSubdir, `${machineId}.json`);
  // 低設定想定店舗混合のように、店舗の一覧がサイト側の導出でできている場合は実ファイルが無い
  // （lib/ev/low-setting.ts）。公開狙い目は実測側にしか付かないので、無ければ空で返す。
  // 実在する店舗のファイルが欠けていれば、その手前の getMachine が undefined を返して止まる。
  if (!existsSync(file)) return { refreshed: [], replaySource: null };
  const machine = JSON.parse(await fs.readFile(file, 'utf8'));
  if (machine.id !== machineId) throw new Error('Saved target machine mismatch');
  return {
    refreshed: machine.savedTargets === undefined ? [] : parseMachineSavedTargets(machine.savedTargets),
    replaySource: savedTargetReplaySource(machine, hallId),
  };
}

export async function getSavedTargetRefreshes(machineId: string, dataSubdir = '') {
  return (await getSavedTargetSnapshot(machineId, dataSubdir)).refreshed;
}
