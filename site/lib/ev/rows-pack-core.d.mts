export type PackedRows = { v: 1; width: number; n: number; linear: number[]; starts: number[]; first: number[]; count: number[]; columns: number[][] };
export function packRows(rows: number[][], linear: number[], nColumn: number): PackedRows | null;
export function unpackRows(packed: unknown, expectedRows: number): number[][];
