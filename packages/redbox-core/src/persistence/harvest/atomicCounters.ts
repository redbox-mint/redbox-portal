import type { HarvestRunRow } from './HarvestRepositories';
import { HarvestRunStatus, type HarvestCounterSummary } from '../../model/storage/HarvestRunModel';
/** Preserve the previous missing-row response; never recreate a deleted run. */
export function missingRunCounters(
  run: HarvestRunRow,
  counters: HarvestCounterSummary,
  completedAt: string,
  finalChunk: boolean
): HarvestRunRow {
  const next = { ...run, lastChunkAt: completedAt, chunksProcessed: Number(run.chunksProcessed ?? 0) + 1 };
  for (const field of ['totalProcessed', 'created', 'updated', 'deleted', 'unchanged', 'failed'] as const)
    next[field] = Number(run[field] ?? 0) + counters[field];
  if (finalChunk) {
    next.status = Number(next.failed) > 0 ? HarvestRunStatus.completedWithErrors : HarvestRunStatus.completed;
    next.completedAt = completedAt;
  } else if (counters.failed > 0 && run.status === HarvestRunStatus.completed)
    next.status = HarvestRunStatus.completedWithErrors;
  return next;
}
