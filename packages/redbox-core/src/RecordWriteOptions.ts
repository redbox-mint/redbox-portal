import type { FigshareSourceRequest } from './model/storage/FigshareSyncModel';

/** Internal options: never populated from an incoming record or HTTP options. */
export interface RecordWriteOptions {
  figshareIntent?: { intents: FigshareSourceRequest[]; requestedBy: string; saveToken: string; readiness: 'initialising' | 'ready' };
  expectedVersion?: number;
  maintenance?: boolean;
}
export interface RecordFieldWriteResult { updated: boolean; recordVersion?: number }
export class RecordWriteConflict extends Error {
  constructor() { super('Record changed while background work was in progress'); this.name = 'RecordWriteConflict'; }
}
export function assertRecordFieldPaths(fields: Record<string, unknown>, allowed: string[]): void {
  for (const path of Object.keys(fields)) {
    if (!allowed.includes(path) || !/^(metadata|metaMetadata)\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(path)
      || path.split('.').some(p => ['__proto__', 'constructor', 'prototype'].includes(p))) {
      throw new Error(`Unsupported record projection path: ${path}`);
    }
  }
}
