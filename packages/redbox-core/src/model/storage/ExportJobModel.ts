import type { ExportJobStatus } from '@researchdatabox/sails-ng-common';

/** Persisted by ExportService using native atomic updates; never returned directly to clients. */
export interface ExportJobModel {
  jobId: string;
  brandId: string;
  portal: string;
  requestedByUserId: string;
  recordType: string;
  format: 'csv';
  modifiedBefore: string | null;
  modifiedAfter: string | null;
  /** Deleted is a server-only tombstone while artifact cleanup and metadata retention finish. */
  status: ExportJobStatus | 'deleted';
  createdAt: number;
  enqueuedAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  expiresAt: number | null;
  attemptId: string | null;
  heartbeatAt: number | null;
  deadlineAt: number | null;
  cleanupAfter: number | null;
  diskName: string;
  objectKey: string | null;
  byteLength: number | null;
  filename: string;
  authorizationContext: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  /** Metadata is pruned only after successful artifact cleanup and this deadline. */
  cleanedAt: number | null;
}
