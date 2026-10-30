export interface HarvestHistoryRetentionConfig {
  enabled: boolean;
  successfulDays: number;
  failedDays: number;
  batchSize: number;
}

export interface HarvestRunsConfig {
  retention: HarvestHistoryRetentionConfig;
  maxRecordsPerChunk: number;
  maxChunkBytes: number;
  processingChunkTimeoutMinutes: number;
  eventCreateBatchSize: number;
  failedSnapshotMaxBytes: number;
}

export const harvestRuns: HarvestRunsConfig = {
  retention: { enabled: true, successfulDays: 90, failedDays: 365, batchSize: 1000 },
  maxRecordsPerChunk: 250,
  maxChunkBytes: 5_000_000,
  processingChunkTimeoutMinutes: 30,
  eventCreateBatchSize: 250,
  failedSnapshotMaxBytes: 32 * 1024,
};
