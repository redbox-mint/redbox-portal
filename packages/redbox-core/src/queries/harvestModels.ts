import {
  HarvestRunModel,
  HarvestRunChunkModel,
  HarvestRecordEventModel,
  HarvestRunStatus,
  HarvestChunkStatus,
  HarvestOutcome,
  HarvestOperation,
} from '../model/storage/HarvestRunModel';
import type {
  HarvestRunRow,
  HarvestChunkRow as HarvestRunChunkRow,
  HarvestEventRow as HarvestRecordEventRow,
} from '../persistence/harvest/HarvestRepositories';
export function toRunModel(row: HarvestRunRow): HarvestRunModel {
  return new HarvestRunModel({
    id: row.id,
    sourceRunId: String(row.sourceRunId ?? ''),
    brandId: String(row.brandId ?? ''),
    recordType: String(row.recordType ?? ''),
    sourceName: String(row.sourceName ?? ''),
    sourceUri: row.sourceUri ? String(row.sourceUri) : undefined,
    status: (row.status as HarvestRunStatus) ?? HarvestRunStatus.running,
    startedAt: String(row.startedAt ?? ''),
    completedAt: row.completedAt ? String(row.completedAt) : undefined,
    startedBy: row.startedBy ? String(row.startedBy) : undefined,
    lastChunkAt: row.lastChunkAt ? String(row.lastChunkAt) : undefined,
    totalProcessed: Number(row.totalProcessed ?? 0),
    created: Number(row.created ?? 0),
    updated: Number(row.updated ?? 0),
    deleted: Number(row.deleted ?? 0),
    unchanged: Number(row.unchanged ?? 0),
    failed: Number(row.failed ?? 0),
    chunksProcessed: Number(row.chunksProcessed ?? 0),
    duplicateChunks: Number(row.duplicateChunks ?? 0),
    metadata: (row.metadata as Record<string, unknown> | undefined) ?? undefined,
  });
}

export function toChunkModel(row: HarvestRunChunkRow, duplicateOverride?: boolean): HarvestRunChunkModel {
  return new HarvestRunChunkModel({
    id: row.id,
    runId: String(row.runId ?? ''),
    brandId: String(row.brandId ?? ''),
    recordType: String(row.recordType ?? ''),
    sourceRunId: String(row.sourceRunId ?? ''),
    contentHash: String(row.contentHash ?? ''),
    attempt: Number(row.attempt ?? 1),
    chunkIndex: row.chunkIndex == null ? undefined : Number(row.chunkIndex),
    chunkLabel: row.chunkLabel ? String(row.chunkLabel) : undefined,
    totalExpected: row.totalExpected == null ? undefined : Number(row.totalExpected),
    status: (row.status as HarvestChunkStatus) ?? HarvestChunkStatus.processed,
    recordCount: Number(row.recordCount ?? 0),
    totalProcessed: Number(row.totalProcessed ?? 0),
    created: Number(row.created ?? 0),
    updated: Number(row.updated ?? 0),
    deleted: Number(row.deleted ?? 0),
    unchanged: Number(row.unchanged ?? 0),
    failed: Number(row.failed ?? 0),
    duplicate: duplicateOverride ?? Boolean(row.duplicate),
    submittedAt: String(row.submittedAt ?? ''),
    completedAt: row.completedAt ? String(row.completedAt) : undefined,
    errorMessage: row.errorMessage ? String(row.errorMessage) : undefined,
    responseSummary: (row.responseSummary as Record<string, unknown> | undefined) ?? undefined,
  });
}

export function toEventModel(row: HarvestRecordEventRow): HarvestRecordEventModel {
  const outcome = (row.outcome as HarvestOutcome) ?? HarvestOutcome.failed;
  return new HarvestRecordEventModel({
    id: row.id,
    runId: String(row.runId ?? ''),
    chunkId: String(row.chunkId ?? ''),
    brandId: String(row.brandId ?? ''),
    recordType: String(row.recordType ?? ''),
    sourceRunId: String(row.sourceRunId ?? ''),
    harvestId: String(row.harvestId ?? ''),
    oid: row.oid ? String(row.oid) : undefined,
    operation: (row.operation as HarvestOperation) ?? HarvestOperation.upsert,
    outcome,
    status: row.status == null ? outcome !== HarvestOutcome.failed : Boolean(row.status),
    message: row.message ? String(row.message) : undefined,
    details: row.details ? String(row.details) : undefined,
    errorCode: row.errorCode ? String(row.errorCode) : undefined,
    recordSnapshot: (row.recordSnapshot as Record<string, unknown> | undefined) ?? undefined,
    createdAt: String(row.createdAt ?? ''),
  });
}
