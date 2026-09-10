export type TargetRow = { g: number; ev: number | null; n: number; days: number };
export type TargetFilter =
  | { mode: 'all' | 'range' | 'missing'; lo: string; hi: string }
  | { mode: 'category'; lo: ''; hi: ''; value: string }
  | { mode: 'modulo'; lo: ''; hi: ''; period: number; remainder: number };
export type TargetDefinition = {
  schema: 'interval-target/v1'; machineId: string; hallId: 'shinjuku'; profileKey: string;
  startG: number; endG: number | null;
  filters: Record<string, TargetFilter>;
  rate: '46/52'; stopRule: 'evlive';
};
export type MachineSavedTarget = { id: string; conditionKey: string; sourceRevision: string; dataThrough: string; rows: TargetRow[] };
export type PublishedTarget = MachineSavedTarget & {
  name: string; machineId: string; hallId: string; publicationKey: string; definition: TargetDefinition;
  machine: string; profile: string; conditions: string; stopping: string; rate: '46/52'; updatedAt: string; assumedPayout?: boolean;
};
export type SavedTargetCatalog = { schema: 'evlive-saved-targets/v1'; updatedAt: string; targets: PublishedTarget[] };
export type DisplayTarget = PublishedTarget & { refreshed: boolean };
export function parseTargetRows(value: unknown): TargetRow[];
export function parseMachineSavedTargets(value: unknown): MachineSavedTarget[];
export function parseSavedTargetCatalog(value: unknown): SavedTargetCatalog;
export function selectSavedTargets(catalog: SavedTargetCatalog, machineId: string, hallId: string, refreshed?: MachineSavedTarget[]): DisplayTarget[];
