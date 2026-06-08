export enum HarvestRunStatus {
  running = 'running',
  completed = 'completed',
  completedWithErrors = 'completed_with_errors',
  failed = 'failed',
}

export enum HarvestChunkStatus {
  processing = 'processing',
  processed = 'processed',
  failed = 'failed',
  failedStale = 'failed_stale',
}

export enum HarvestOperation {
  create = 'create',
  update = 'update',
  upsert = 'upsert',
  delete = 'delete',
}

export enum HarvestOutcome {
  created = 'created',
  updated = 'updated',
  deleted = 'deleted',
  unchanged = 'unchanged',
  failed = 'failed',
}

export type HarvestCounterSummary = {
  totalProcessed: number;
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  failed: number;
};

export type HarvestRunMetadata = Record<string, unknown>;

export class HarvestRunModel {
  id?: string;
  sourceRunId = '';
  brandId = '';
  recordType = '';
  sourceName = '';
  sourceUri?: string;
  status: HarvestRunStatus = HarvestRunStatus.running;
  startedAt = '';
  completedAt?: string;
  startedBy?: string;
  lastChunkAt?: string;
  totalProcessed = 0;
  created = 0;
  updated = 0;
  deleted = 0;
  unchanged = 0;
  failed = 0;
  chunksProcessed = 0;
  duplicateChunks = 0;
  metadata?: HarvestRunMetadata;

  constructor(init?: Partial<HarvestRunModel>) {
    Object.assign(this, init);
  }
}

export class HarvestRunChunkModel {
  id?: string;
  runId = '';
  brandId = '';
  recordType = '';
  sourceRunId = '';
  contentHash = '';
  attempt = 1;
  chunkIndex?: number;
  chunkLabel?: string;
  totalExpected?: number;
  status: HarvestChunkStatus = HarvestChunkStatus.processed;
  recordCount = 0;
  totalProcessed = 0;
  created = 0;
  updated = 0;
  deleted = 0;
  unchanged = 0;
  failed = 0;
  duplicate = false;
  submittedAt = '';
  completedAt?: string;
  errorMessage?: string;
  responseSummary?: Record<string, unknown>;

  constructor(init?: Partial<HarvestRunChunkModel>) {
    Object.assign(this, init);
  }
}

export class HarvestRecordEventModel {
  id?: string;
  runId = '';
  chunkId = '';
  brandId = '';
  recordType = '';
  sourceRunId = '';
  harvestId = '';
  oid?: string;
  operation: HarvestOperation = HarvestOperation.upsert;
  outcome: HarvestOutcome = HarvestOutcome.failed;
  status = false;
  message?: string;
  details?: string;
  errorCode?: string;
  recordSnapshot?: Record<string, unknown>;
  createdAt = '';

  constructor(init?: Partial<HarvestRecordEventModel>) {
    Object.assign(this, init);
  }
}

export type HarvestRunListQuery = {
  brandId: string;
  status?: string;
  recordType?: string;
  sourceName?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
};

export type HarvestRunEventsQuery = {
  runId: string;
  brandId: string;
  outcome?: string;
  operation?: string;
  harvestId?: string;
  oid?: string;
  page: number;
  pageSize: number;
};

export type HarvestRunListResult = {
  rows: HarvestRunModel[];
  total: number;
};

export type HarvestRunEventsResult = {
  rows: HarvestRecordEventModel[];
  total: number;
};

export type HarvestRunDetailResult = {
  run: HarvestRunModel;
  chunks: HarvestRunChunkModel[];
  events: HarvestRecordEventModel[];
  aggregateCounts: HarvestCounterSummary & {
    chunksProcessed: number;
    duplicateChunks: number;
  };
};
