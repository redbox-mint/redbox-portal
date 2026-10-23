import type { HarvestCounterSummary } from '../../model/storage/HarvestRunModel';
/** Plain lineage documents. References stay strings, never BSON or loaded models. */
export interface HarvestRunRow extends Record<string, unknown> {
  id?: string;
  sourceRunId: string;
  brandId: string;
  recordType: string;
  sourceName: string;
  sourceUri?: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  startedBy?: string;
  lastChunkAt?: string;
  totalProcessed?: number;
  created?: number;
  updated?: number;
  deleted?: number;
  unchanged?: number;
  failed?: number;
  chunksProcessed?: number;
  duplicateChunks?: number;
  metadata?: Record<string, unknown> | null;
}
export interface HarvestChunkRow extends Record<string, unknown> {
  id?: string;
  runId: string;
  brandId: string;
  recordType: string;
  sourceRunId: string;
  contentHash: string;
  attempt?: number;
  chunkIndex?: number;
  chunkLabel?: string;
  totalExpected?: number;
  status: string;
  recordCount?: number;
  totalProcessed?: number;
  created?: number;
  updated?: number;
  deleted?: number;
  unchanged?: number;
  failed?: number;
  duplicate?: boolean;
  submittedAt: string;
  completedAt?: string;
  errorMessage?: string;
  responseSummary?: Record<string, unknown> | null;
}
export interface HarvestEventRow extends Record<string, unknown> {
  id?: string;
  runId: string;
  chunkId: string;
  brandId: string;
  recordType: string;
  sourceRunId: string;
  harvestId: string;
  oid?: string;
  operation: string;
  outcome: string;
  status: boolean;
  message?: string;
  details?: string;
  errorCode?: string;
  recordSnapshot?: Record<string, unknown> | null;
  createdAt: string;
}
export interface HarvestRunLookup {
  id?: string;
  brandId?: string;
  recordType?: string;
  sourceName?: string;
  sourceRunId?: string;
}
export interface HarvestRunFilter {
  brandId: string;
  status?: string;
  recordType?: string;
  sourceName?: string;
  startedAt?: { '>='?: string; '<='?: string };
}
export interface HarvestEventFilter {
  runId: string;
  brandId: string;
  outcome?: string;
  operation?: string;
  harvestId?: string;
  oid?: string;
}
export interface HarvestRepositories {
  runs: {
    findRun(lookup: HarvestRunLookup): Promise<HarvestRunRow | null>;
    createRun(values: Record<string, unknown>): Promise<HarvestRunRow>;
    listRuns(filter: HarvestRunFilter, skip: number, limit: number): Promise<HarvestRunRow[]>;
    countRuns(filter: HarvestRunFilter): Promise<number>;
    completeChunkCounters(
      run: HarvestRunRow,
      counters: HarvestCounterSummary,
      finalChunk: boolean,
      completedAt: string
    ): Promise<HarvestRunRow>;
    incrementDuplicateChunks(run: HarvestRunRow, completedAt?: string): Promise<HarvestRunRow>;
    removeRun(id: string): Promise<void>;
  };
  chunks: {
    findAttempts(runId: string, contentHash: string): Promise<HarvestChunkRow[]>;
    listForRun(runId: string, brandId: string, limit: number): Promise<HarvestChunkRow[]>;
    createAttempt(values: Record<string, unknown>): Promise<HarvestChunkRow>;
    reviseAttempt(id: string, values: Record<string, unknown>): Promise<HarvestChunkRow | null>;
    removeForRun(runId: string): Promise<void>;
  };
  events: {
    appendEvents(values: Record<string, unknown>[]): Promise<void>;
    listCheckpointed(runId: string, brandId: string, chunkIds: string[]): Promise<HarvestEventRow[]>;
    listEvents(
      filter: HarvestEventFilter,
      skip: number,
      limit: number,
      ascending?: boolean
    ): Promise<HarvestEventRow[]>;
    countEvents(filter: HarvestEventFilter): Promise<number>;
    removeForRun(runId: string): Promise<void>;
  };
}
