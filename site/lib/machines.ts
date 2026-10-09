import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import type { CounterEstimate, Machine, MachineSummary, ProvisionalSetting1 } from "./ev/types";
import { withoutForeignCounterEstimate } from "./ev/counter-estimate";
import { validateMachine } from "./ev/validate";
import { LOW_SETTING_HALL_SUBDIR, RAW_MIXED_HALL_SUBDIR, onlyLowSetting, withoutLowSetting } from "./ev/low-setting";
import { compareMachines } from "./machine-order";
import { HALLS, getReadyHalls, getHall, isListedHall } from "./halls";
import { machineSummary } from "./ev/summary";
import { normalizeMachineMetadata } from "./machine-metadata";
import type { HeatmapCoverageMachine } from "./heatmap/coverage";
import { readCollectionCatalog } from "./collection-status-catalog";
import type { CollectedMachine } from "./collection-status-contract";
import { selectMachineListSummaries } from "./machine-list-summary";
import { inlineSourceAggregations, sourceAggregatesDir } from "./source-aggregations.mjs";
import { getRegisteredProvisionalSetting1 } from "./ev/provisional-setting1";

// Data lives at the repository root (data/machines), while the site builds from
// site/. Resolve against the repo root so it works whether the cwd is site/
// (next build / vitest) or the repo root.
function resolveMachinesDir(): string {
  const candidates = [
    path.join(process.cwd(), "data", "machines"),
    path.join(process.cwd(), "..", "data", "machines")
  ];
  return candidates.find((dir) => existsSync(dir)) ?? candidates[candidates.length - 1];
}

const machinesDir = resolveMachinesDir();

// 店舗ごとのデータ置き場。既定店舗（新宿）は data/machines 直下、他店は
// data/machines/<dataSubdir>/。スクレイパー側 make_evlive_data.py の OUT_DIR と対。
function hallDir(dataSubdir?: string): string {
  return dataSubdir ? path.join(machinesDir, dataSubdir) : machinesDir;
}

// 静的書き出し中は、同じフォルダを1回だけ読む。店舗混合のフォルダは「補正あり」と
// 「補正なし」の2店舗から読まれ、どちらも大きい集計を展開するので、二度読むと
// 一覧ページの生成が1ページ60秒の上限に近づく。開発サーバでは毎回読み直す。
const buildReadCache = new Map<string, Promise<Machine[]>>();

async function readMachines(dir: string): Promise<Machine[]> {
  if (process.env.STATIC_EXPORT !== "true") return readMachinesUncached(dir);
  let cached = buildReadCache.get(dir);
  if (!cached) {
    cached = readMachinesUncached(dir);
    buildReadCache.set(dir, cached);
  }
  // 呼び出し側が並べ替え・加工しても、ほかの店舗の結果に響かないよう配列は複製する。
  return [...await cached];
}

async function readMachinesUncached(dir: string): Promise<Machine[]> {
  // 未集計の店舗はフォルダ自体が無い。空一覧を返して「準備中」として扱う。
  if (!existsSync(dir)) return [];
  const entries = await fs.readdir(dir);
  const jsonFiles = entries.filter((entry) => entry.endsWith(".json"));
  return Promise.all(
    jsonFiles.map(async (fileName) => {
      const raw = await fs.readFile(path.join(dir, fileName), "utf8");
      return normalizeMachineMetadata(validateMachine(
        inlineSourceAggregations(JSON.parse(raw), sourceAggregatesDir(machinesDir))));
    })
  );
}

async function readMachine(dir: string, id: string): Promise<Machine | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(dir, `${id}.json`), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const machine = normalizeMachineMetadata(validateMachine(
    inlineSourceAggregations(JSON.parse(raw), sourceAggregatesDir(machinesDir))));
  return machine.id === id ? machine : undefined;
}

/** A stored correction survives an older collector overwriting the source JSON.
 *  ★補正の表だけを返す。補正の無い合算はここに出さず、mixed-raw 側に出す。 */
function selectMixedMachine(stored?: Machine, source?: Machine): Machine | undefined {
  // A combined dataset must not be replaced by a single store's correction.
  if (stored && "mixedSources" in stored) return onlyLowSetting(stored) ?? undefined;
  // Validated dates use YYYY-MM-DD, so string comparison preserves date order.
  if (source?.setting1Correction && (!stored || source.lastUpdated >= stored.lastUpdated)) {
    return onlyLowSetting(source) ?? undefined;
  }
  // 合算の印が無い旧形式は、補正済みの表をそのまま保存したもの。補正なしの合算ではない。
  return stored?.setting1Correction ? onlyLowSetting(stored) ?? undefined : stored;
}

/** 店舗混合の合算を、設定1補正をかけずに実測のまま出す。合算JSONが無い機種は出さない。 */
function rawMixedMachine(stored?: Machine): Machine | undefined {
  if (!stored || !("mixedSources" in stored)) return undefined;
  return withoutLowSetting(stored) ?? undefined;
}

/** JSONの置き場所（店舗フォルダ）から店舗IDを引く。推定表の店舗照合に使う。 */
function hallIdOf(dataSubdir?: string): string | undefined {
  return HALLS.find(hall => hall.dataSubdir === (dataSubdir ?? ""))?.id;
}

export async function getMachines(dataSubdir?: string): Promise<Machine[]> {
  const hallId = hallIdOf(dataSubdir);
  return (await loadHallMachines(dataSubdir)).map(machine => withoutForeignCounterEstimate(machine, hallId));
}

async function loadHallMachines(dataSubdir?: string): Promise<Machine[]> {
  const dir = hallDir(dataSubdir);
  // ★「設定1想定」をどの店舗に出すかはサイト側で決める（lib/ev/low-setting.ts）。
  //   生成側にも同じ切り分けを入れたが、そちらは再生成しないと効かない。
  //   ここで同じ結果になるようにしておけば、データを待たずに今のJSONで正しく出る。
  if (dataSubdir === LOW_SETTING_HALL_SUBDIR) {
    const sources = await readMachines(hallDir());
    // フォルダが無い間は従来の設定1想定表も既定店舗から導く。
    if (!existsSync(dir)) {
      return sources.map(onlyLowSetting)
        .filter((machine): machine is Machine => machine !== null)
        .sort(compareMachines);
    }
    const storedById = new Map((await readMachines(dir)).map((machine) => [machine.id, machine]));
    const sourceById = new Map(sources.filter((machine) => machine.setting1Correction)
      .map((machine) => [machine.id, machine]));
    const ids = new Set([...storedById.keys(), ...sourceById.keys()]);
    const machines = [...ids].map((id) => selectMixedMachine(storedById.get(id), sourceById.get(id)))
      .filter((machine): machine is Machine => machine !== undefined);
    return machines.sort(compareMachines);
  }
  if (dataSubdir === RAW_MIXED_HALL_SUBDIR) {
    return (await readMachines(hallDir(LOW_SETTING_HALL_SUBDIR)))
      .map((machine) => rawMixedMachine(machine))
      .filter((machine): machine is Machine => machine !== undefined)
      .sort(compareMachines);
  }
  const machines = await readMachines(dir);
  return machines
    .map(withoutLowSetting)
    .filter((machine): machine is Machine => machine !== null)
    .sort(compareMachines);
}

export async function getAvailableMachines(dataSubdir?: string): Promise<Machine[]> {
  const machines = await getMachines(dataSubdir);
  return machines.filter((machine) => machine.available);
}

/** Default-hall presence only, including held/unavailable machines. No monetary values escape this path. */
export async function getShinjukuHeatmapCoverageSources(): Promise<HeatmapCoverageMachine[]> {
  return (await readMachines(hallDir())).map(({ id, lastUpdated, heatmapCoverage }) => ({ id, lastUpdated, heatmapCoverage }));
}

export async function getMachine(id: string, dataSubdir?: string): Promise<Machine | undefined> {
  const machine = await loadHallMachine(id, dataSubdir);
  return machine ? withoutForeignCounterEstimate(machine, hallIdOf(dataSubdir)) : undefined;
}

async function loadHallMachine(id: string, dataSubdir?: string): Promise<Machine | undefined> {
  // IDs are JSON basenames, not aliases or paths. Detail pages must not read
  // every machine again: each static route otherwise reparses the whole data set.
  if (!/^[a-z0-9_-]+$/.test(id) || (dataSubdir && !/^[a-z0-9_-]+$/.test(dataSubdir))) {
    return undefined;
  }
  const dir = hallDir(dataSubdir);
  const isLowSetting = dataSubdir === LOW_SETTING_HALL_SUBDIR;
  if (isLowSetting) {
    const source = await readMachine(hallDir(), id);
    if (!existsSync(dir)) return source ? onlyLowSetting(source) ?? undefined : undefined;
    return selectMixedMachine(await readMachine(dir, id), source);
  }
  if (dataSubdir === RAW_MIXED_HALL_SUBDIR) {
    return rawMixedMachine(await readMachine(hallDir(LOW_SETTING_HALL_SUBDIR), id));
  }
  const machine = await readMachine(dir, id);
  return machine ? withoutLowSetting(machine) ?? undefined : undefined;
}

/** Route IDs include machines collected only in a non-default hall. */
export async function getMachineIds(): Promise<string[]> {
  const halls = await Promise.all(getReadyHalls().map((hall) => getHallDisplays(hall.id)));
  return [...new Set(halls.flatMap((items) => items.map(item => displaySummary(item).id)))];
}

export type MachineHallSummary = { hallId: string; summary: MachineSummary };

/** Metadata for navigation; each summary keeps the hall its counts came from. */
export async function getMachineHallSummaries(id: string): Promise<MachineHallSummary[]> {
  const summaries = await Promise.all(getReadyHalls().map(async (hall) => {
    const display = await getHallDisplay(id, hall.id);
    return display ? { hallId: hall.id, summary: displaySummary(display) } : undefined;
  }));
  return summaries.filter((item): item is MachineHallSummary => item !== undefined);
}

export type HallDisplay = { kind: "machine"; machine: Machine }
  | { kind: "collection"; collection: CollectedMachine; provisionalSetting1?: ProvisionalSetting1; counterEstimate?: CounterEstimate };

export function displaySummary(display: HallDisplay): MachineSummary {
  return display.kind === "machine" ? machineSummary(display.machine) : display.collection.summary;
}

function hasSavedHistory(summary: MachineSummary): boolean {
  const collection = summary.meta.collection;
  return Boolean(collection && collection.rows > 0 && collection.units > 0 && collection.days > 0);
}

/** Reference numbers never replace a usable EV/estimate, nor unlock a held numerical profile. */
function withPendingReference(machine: Machine): Machine {
  if (machine.counterEstimate || machine.provisionalSetting1 || machine.meta.samples !== "0"
    || !hasSavedHistory(machine) || !machine.profiles.every(profile => profile.dataPending === true
      && profile.baseAnchors.length === 0 && (profile.sessions === undefined || profile.sessions === 0))) return machine;
  const reference = getRegisteredProvisionalSetting1(machine.id, machine.name);
  return reference ? { ...machine, provisionalSetting1: reference } : machine;
}

/** Only an observation in this hall permits a catalog fallback. The catalog contains no hall data. */
function collectionDisplay(collection: CollectedMachine, source?: Machine): HallDisplay {
  const matched = source?.available && source.id === collection.summary.id && source.name === collection.summary.name ? source : undefined;
  if (matched?.counterEstimate) return { kind: "collection", collection, counterEstimate: matched.counterEstimate };
  const reference = hasSavedHistory(collection.summary)
    ? matched?.provisionalSetting1 ?? getRegisteredProvisionalSetting1(collection.summary.id, collection.summary.name)
    : undefined;
  return { kind: "collection", collection, ...(reference ? { provisionalSetting1: reference } : {}) };
}

/** Numeric publications and their admission rules remain unchanged by observations. */
export async function getHallDisplays(hallId: string): Promise<HallDisplay[]> {
  const hall = getHall(hallId);
  if (!isListedHall(hall) || !hall.ready) return [];
  const [machines, observations] = await Promise.all([
    getAvailableMachines(hall.dataSubdir), readCollectionCatalog(path.dirname(machinesDir), hallId),
  ]);
  const displays = new Map<string, HallDisplay>(machines.map(machine => [machine.id, { kind: "machine", machine: withPendingReference(machine) }]));
  for (const { forcePending, ...collection } of observations) {
    if (forcePending || !displays.has(collection.summary.id)) {
      const source = machines.find(machine => machine.id === collection.summary.id);
      displays.set(collection.summary.id, collectionDisplay(collection, source));
    }
  }
  return [...displays.values()].sort((a, b) => compareMachines(displaySummary(a), displaySummary(b)));
}

export async function getHallDisplay(id: string, hallId: string): Promise<HallDisplay | undefined> {
  const hall = getHall(hallId);
  if (!isListedHall(hall) || !hall.ready || !/^[a-z0-9]{1,40}$/.test(id)) return undefined;
  const [machine, observations] = await Promise.all([
    getMachine(id, hall.dataSubdir), readCollectionCatalog(path.dirname(machinesDir), hallId),
  ]);
  const entry = observations.find(item => item.summary.id === id);
  if (entry && (entry.forcePending || !machine?.available)) {
    const { forcePending: _, ...collection } = entry;
    return collectionDisplay(collection, machine);
  }
  return machine?.available ? { kind: "machine", machine: withPendingReference(machine) } : undefined;
}

export async function getMachineListSummaries(): Promise<MachineSummary[]> {
  const halls = await Promise.all(getReadyHalls().map(async hall =>
    (await getHallDisplays(hall.id)).map(display => ({ hallId: hall.id, summary: displaySummary(display) }))));
  return selectMachineListSummaries(halls.flat());
}
