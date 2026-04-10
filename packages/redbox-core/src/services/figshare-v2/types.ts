import { RecordModel } from '../../model/storage/RecordModel';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';

export type AnyRecord = Record<string, unknown>;
export type RecordLike = RecordModel | AnyRecord;

export type FigsharePublicationStatus =
  | 'idle'
  | 'pending'
  | 'syncing'
  | 'awaiting_upload_completion'
  | 'published'
  | 'failed';

export type FigsharePhase =
  | 'preparePublication'
  | 'syncMetadata'
  | 'syncAssets'
  | 'syncEmbargo'
  | 'publishIfNeeded'
  | 'writeBack';

export interface FigshareSyncState {
  status: FigsharePublicationStatus;
  lockOwner?: string;
  lastError?: string;
  lastSyncAt?: string;
  correlationId?: string;
  partialProgress?: Record<string, unknown>;
}

export interface FigsharePublicationPlan {
  action: 'create' | 'update' | 'republish' | 'skip';
  articleId?: string;
  sameJob: boolean;
  syncState: FigshareSyncState;
}

export interface FigshareRunContext {
  recordOid: string;
  brandName: string;
  articleId?: string;
  jobId?: string;
  correlationId: string;
  triggerSource: string;
}

export interface FigsharePhaseResult<T = AnyRecord> {
  phase: FigsharePhase;
  outcome: 'success' | 'skipped' | 'failed';
  data: T;
}

export interface FigshareErrorInfo {
  category: 'config' | 'validation' | 'transport' | 'duplicate' | 'unknown';
  message: string;
  retryable: boolean;
  cause?: unknown;
}

export interface FigshareServiceDeps {
  config: FigsharePublishingConfigData;
  runContext: FigshareRunContext;
}
