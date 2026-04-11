import { RecordModel } from '../../model/storage/RecordModel';
import { UserModel } from '../../model/storage/UserModel';
import { RoleModel } from '../../model/storage/RoleModel';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';

// ── Utility aliases ──────────────────────────────────────────────────

/** @deprecated Prefer a specific interface. Retained only for truly unstructured data. */
export type AnyRecord = Record<string, unknown>;


// Re-export model types used across figshare modules
export type { RecordModel, UserModel, RoleModel };

// ── Figshare API response types ──────────────────────────────────────

export interface FigshareArticle {
  id: number | string;
  title?: string;
  description?: string;
  status?: string;
  doi?: string;
  url?: string;
  url_public_html?: string;
  url_private_html?: string;
  url_public_api?: string;
  url_private_api?: string;
  is_embargoed?: boolean;
  access_type?: string;
  embargo_date?: string;
  embargo_reason?: string;
  [key: string]: unknown;
}

export interface FigshareFile {
  id: number | string;
  name: string;
  size?: number;
  status?: string;
  download_url?: string;
  is_link_only?: boolean;
  [key: string]: unknown;
}

export interface FigshareUploadInit {
  location: string;
  [key: string]: unknown;
}

export interface FigshareUploadDescriptor {
  id: string | number;
  upload_url: string;
  download_url?: string;
  status?: string;
  parts?: FigshareUploadPart[];
  [key: string]: unknown;
}

export interface FigshareUploadPart {
  partNo: number;
  startOffset: number;
  endOffset: number;
}

export interface FigshareLicense {
  value: number | string;
  name: string;
  url?: string;
  id?: number | string;
  [key: string]: unknown;
}

export interface FigshareInstitutionAccount {
  id: number | string;
  email?: string;
  first_name?: string;
  last_name?: string;
  [key: string]: unknown;
}

export interface FigsharePublishResult {
  id?: number | string;
  status?: string;
  [key: string]: unknown;
}

// ── ReDBox domain types ──────────────────────────────────────────────

export interface DataLocationEntry {
  type: 'attachment' | 'url';
  fileId?: string;
  name?: string;
  location?: string;
  selected?: boolean;
  ignore?: boolean;
  notes?: string;
  originalFileName?: string;
  download_url?: string;
  [key: string]: unknown;
}

export interface RecordContributor {
  email?: string;
  text_full_name?: string;
  name?: string;
  orcid?: string;
  username?: string;
  [key: string]: unknown;
}

export interface WorkflowTransitionJobConfig {
  enabled?: boolean | string;
  namedQuery?: string;
  targetStep?: string;
  paramMap?: Record<string, string>;
  figshareTargetFieldKey?: string;
  figshareTargetFieldValue?: string;
  username?: string;
  userType?: string;
}

export interface FigshareJobData {
  oid?: string;
  articleId?: string;
  brandId?: string;
  user?: UserModel;
}

export interface FigshareJob {
  attrs?: {
    data?: FigshareJobData;
  };
}

export interface AssetSyncResult {
  articleId: string;
  attachmentCount: number;
  urlCount: number;
  uploadsComplete: boolean;
  uploadedAttachments: FigshareFile[];
  uploadedUrls: FigshareFile[];
  dataLocations: DataLocationEntry[];
  [key: string]: unknown;
}

// ── Sync-state & planning ────────────────────────────────────────────

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

export interface FigsharePhaseResult<T = Record<string, unknown>> {
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

// ── Helpers ──────────────────────────────────────────────────────────

/** Type-safe dynamic path getter for record fields driven by config paths. */
export function getRecordField(record: RecordModel, path: string): unknown {
  // Walk the dot-separated path through the record
  let current: unknown = record;
  for (const segment of path.split('.')) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Type-safe dynamic path setter for record fields driven by config paths. */
export function setRecordField(record: RecordModel, path: string, value: unknown): void {
  const segments = path.split('.');
  let current: Record<string, unknown> = record;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (current[segment] == null || typeof current[segment] !== 'object') {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}
