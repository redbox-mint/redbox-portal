/** Browser contract for background admin CSV exports. */
export type ExportJobStatus = 'queued' | 'running' | 'ready' | 'failed' | 'expired';

export interface ExportJobRequest {
  format: 'csv';
  recType: string;
  before?: string;
  after?: string;
}

/** Contains no storage locations, authorization details, or worker identifiers. */
export interface ExportJobDto {
  id: string;
  recordType: string;
  format: 'csv';
  modifiedBefore: string | null;
  modifiedAfter: string | null;
  status: ExportJobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  filename: string;
  byteLength: number | null;
  /** Path relative to the branding and portal base URL, available only when ready. */
  downloadUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}
