import type { FigshareSyncModel, FigshareIntentKind } from '../../model/storage/FigshareSyncModel';
export class FigshareLeaseLost extends Error {
  constructor() {
    super('Figshare worker lease was lost');
    this.name = 'FigshareLeaseLost';
  }
}
const kinds: FigshareIntentKind[] = ['sync', 'cleanup', 'observe'];
export function nextAction(work: FigshareSyncModel['work']): number | null {
  const times = kinds.map(k => work[k].dueAt).filter((t): t is number => t != null);
  return times.length ? Math.min(...times) : null;
}

export type { FigshareSyncRepository as FigshareSyncStore } from '../../persistence/figshare/FigshareSyncRepository';
