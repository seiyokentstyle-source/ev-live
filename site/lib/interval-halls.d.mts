export type IntervalHallId = 'shinjuku' | 'kabuki' | 'mixed';
export type IntervalHall = Readonly<{ id: IntervalHallId; dataSubdir: string; name: string; evotHallId: string }>;
export const INTERVAL_HALLS: readonly IntervalHall[];
export function intervalHall(id: string): IntervalHall | undefined;
export function intervalHallForEvot(id: string): IntervalHall | undefined;
