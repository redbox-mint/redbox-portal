export interface HarvestRunsConfig {
  maxRecordsPerChunk: number;
  maxChunkBytes: number;
  processingChunkTimeoutMinutes: number;
  eventCreateBatchSize: number;
  failedSnapshotMaxBytes: number;
}

export const harvestRuns: HarvestRunsConfig = {
  maxRecordsPerChunk: 250,
  maxChunkBytes: 5_000_000,
  processingChunkTimeoutMinutes: 30,
  eventCreateBatchSize: 250,
  failedSnapshotMaxBytes: 32 * 1024,
};
