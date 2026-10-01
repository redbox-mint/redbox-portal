import type { IntegrationAuditContext } from '../../services/IntegrationAuditService';

export type FigshareIntentKind = 'sync' | 'cleanup' | 'observe';
export interface FigshareSourceRequest {
  kind: 'sync' | 'cleanup';
  policyId: string;
  /** Business eligibility only; source authorisation has already succeeded. */
  condition: string;
  requestedBy?: string;
}
export interface FigshareSourceIntent {
  generation: number;
  pending: boolean;
  readiness: 'initialising' | 'ready';
  saveToken: string;
  requestedAt: string;
  requestedBy: string;
  intents: FigshareSourceRequest[];
}
export interface FigshareWork {
  requested: number;
  processed: number;
  dueAt: number | null;
  sourceGeneration: number;
  policies: FigshareSourceRequest[];
  requestedBy: string;
}
export interface FigshareBinding {
  namespace: string;
  accountId: string;
  ownerId: string;
  articleId?: string;
  observedOwnerId?: string;
}
export interface FigshareCreateOperation {
  token: string;
  binding: FigshareBinding;
  startedAt: string;
  outcome: 'submitted' | 'uncertain' | 'failed' | 'confirmed';
  error?: string;
  verifiedId?: string;
}
export interface FigshareAssetReceipt {
  key: string;
  localId: string;
  digest: string;
  md5?: string;
  resumeApproved?: boolean;
  size: number;
  name: string;
  articleId: string;
  fileId?: string;
  kind: 'hosted' | 'link';
  link?: string;
  state: 'initialising' | 'uploading' | 'completing' | 'available' | 'deleting' | 'removed';
  downloadUrl?: string;
  desired: boolean;
  completedAt?: string;
}
export interface FigsharePublishOperation {
  generation: number;
  hash: string;
  previousVersion: number;
  outcome: 'submitted' | 'accepted' | 'uncertain' | 'rejected' | 'observed';
  submittedAt: string;
}
export interface FigshareSyncModel {
  oid: string;
  brandId: string;
  revision: number;
  importedGeneration: number;
  work: Record<FigshareIntentKind, FigshareWork>;
  nextActionAt: number | null;
  dispatchUntil: number;
  leaseOwner: string | null;
  leaseUntil: number;
  binding?: FigshareBinding;
  /** Denormalised solely for the exclusive partial index. */
  namespace?: string;
  articleId?: string;
  create?: FigshareCreateOperation;
  createGeneration?: number;
  createRequest?: number;
  publish?: FigsharePublishOperation;
  receipts: FigshareAssetReceipt[];
  checkpoints: { metadata?: string; assets?: string; embargo?: string };
  status: 'queued' | 'running' | 'waiting' | 'retrying' | 'synced' | 'failed' | 'repair_required' | 'cancelled';
  waitingReason?: string;
  publication?: 'private' | 'pending' | 'published' | 'unknown';
  embargoed?: boolean;
  accessible?: boolean;
  observedAt?: string;
  publicationAuditKey?: string;
  error?: { kind?: FigshareIntentKind; category: string; message: string; count: number; firstAt: string; lastAt: string; terminal: boolean };
  audit?: IntegrationAuditContext | null;
  auditClosed?: boolean;
  corrections?: Array<{ at: string; actor: string; action: string; articleId?: string }>;
}
