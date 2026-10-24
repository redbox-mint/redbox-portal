import type {
  VocabularyRow,
  EntryRow,
  SourceRow,
  CategoryRow,
  CrosswalkRow,
  MappingRow,
  SyncRunRow,
} from '../vocabulary/VocabularyRepositories';
// Repository rows admit extension keys; public attributes expose only declared fields.
type RowFields<T> = { [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K] };
/** Plain repository data contracts. No runtime model registration or query methods. */
import type { BrandingTypefaceState } from '../../model/BrandingTypeface';
import type { DashboardConfigurationData } from '../../configmodels/DashboardSettings';
import type { DashboardTableConfig } from '../../config/workflow.config';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import type { HarvestOperation, HarvestOutcome } from '../../model/storage/HarvestRunModel';
import type { HarvestRunStatus } from '../../model/storage/HarvestRunModel';
import type { HarvestChunkStatus } from '../../model/storage/HarvestRunModel';
import type { RecordTypeValidationConfig } from '../../config/recordtype.config';
import type { RecordConcurrentModificationConfig } from '@researchdatabox/sails-ng-common';
import type { RecordTypeRecordSchemaConfig } from '../../config/recordSchema.config';
export type JsonMap = Record<string, unknown>;
export interface PersistenceRow {
  id: string;
}

export interface AppConfigAttributes extends PersistenceRow {
  branding: string | number | BrandingConfigAttributes;
  configData?: Record<string, unknown>;
  configKey: string;
}

export interface AsynchProgressAttributes extends PersistenceRow {
  branding: string | number | BrandingConfigAttributes;
  currentIdx?: number;
  date_completed?: string;
  date_started?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  name: string;
  relatedRecordId?: string;
  started_by: string;
  status?: string;
  targetIdx?: number;
  taskType?: string;
}

export interface AttachmentAccessAuditAttributes extends PersistenceRow {
  accessedAt: string | Date;
  accessedBy?: string;
  action: 'access' | 'download' | 'list' | 'upload' | 'remove' | string;
  fileId?: string;
  itemCount?: number;
  oid: string;
  storageKey?: string;
}

export interface AttachmentMetadataAttributes extends PersistenceRow {
  accessCount?: number;
  attachmentId?: string | null;
  operation?: 'add' | 'finalize' | 'delete';
  mutationState?:
    | 'prepared'
    | 'pending'
    | 'applied'
    | 'incomplete'
    | 'unknown'
    | 'cancelled'
    | 'cleanup-pending'
    | 'cleanup-checking'
    | 'cleanup-removing'
    | 'cleaned'
    | 'staging-available'
    | 'staging-preparing'
    | 'staging-cleanup';
  generation?: string | null;
  isJournal?: boolean;
  mutationFileId?: string | null;
  stagingActorId?: string;
  stagingBrandId?: string;
  coordinationToken?: string | null;
  attemptCount?: number;
  lastAttemptAt?: string | Date | null;
  coordinationLeaseExpiresAt?: string | Date | null;
  lastSafeErrorCode?: string | null;
  attachmentField?: string;
  contentLength?: number;
  contentType?: string;
  etag?: string;
  fileId: string;
  filename?: string;
  lastAccessedAt?: string | Date;
  lastAccessedBy?: string;
  lastModified?: string | Date;
  mimeType?: string;
  oid: string;
  storageKey: string;
  uploadedBy?: string;
}

export interface BrandingConfigAttributes extends PersistenceRow {
  css?: string;
  hash?: string;
  logo?: Record<string, unknown>;
  favicon?: Record<string, unknown>;
  name?: string;
  roles?: unknown[];
  variables?: Record<string, string>;
  version?: number;
  typeface?: BrandingTypefaceState | null;
  draftTypeface?: BrandingTypefaceState | null;
  draftRevision?: number;
}

export interface BrandingConfigHistoryAttributes extends PersistenceRow {
  branding: string | number | BrandingConfigAttributes;
  css?: string;
  dateCreated?: string;
  hash: string;
  variables?: Record<string, string>;
  version: number;
  typeface?: BrandingTypefaceState | null;
  actorId?: string;
  actorDisplayName?: string;
  restoredFromVersion?: number;
}

export interface CacheEntryAttributes extends PersistenceRow {
  data?: Record<string, unknown>;
  name: string;
  ts_added: number;
}

export interface CounterAttributes extends PersistenceRow {
  branding?: string | number | BrandingConfigAttributes;
  name: string;
  value?: number;
}

export interface DashboardConfigurationAttributes extends PersistenceRow {
  branding: string;
  revision: number;
  configData: DashboardConfigurationData;
  provenance?: Record<string, unknown>;
}

export interface DashboardTypeAttributes extends PersistenceRow {
  branding: string | number | BrandingConfigAttributes;
  description?: string;
  formatRules: Record<string, unknown>;
  key?: string;
  name: string;
  tableConfig?: DashboardTableConfig;
  searchable?: boolean;
  system?: boolean;
}

export interface FigshareVocabularyCategoryAttributes extends Omit<RowFields<CategoryRow>, 'entry' | 'source'> {
  entry: string | number | VocabularyEntryAttributes;
  source: string | number | FigshareVocabularySourceAttributes;
}

export interface FigshareVocabularyCrosswalkAttributes extends Omit<
  RowFields<CrosswalkRow>,
  'branding' | 'figshareSource' | 'localVocabulary'
> {
  branding: string | number | BrandingConfigAttributes;
  figshareSource: string | number | FigshareVocabularySourceAttributes;
  localVocabulary: string | number | VocabularyAttributes;
}

export interface FigshareVocabularyCrosswalkMappingAttributes extends Omit<
  RowFields<MappingRow>,
  'crosswalk' | 'figshareCategory' | 'localEntry'
> {
  crosswalk: string | number | FigshareVocabularyCrosswalkAttributes;
  figshareCategory: string | number | FigshareVocabularyCategoryAttributes;
  localEntry: string | number | VocabularyEntryAttributes;
}

export interface FigshareVocabularySourceAttributes extends Omit<RowFields<SourceRow>, 'branding' | 'vocabulary'> {
  branding: string | number | BrandingConfigAttributes;
  vocabulary: string | number | VocabularyAttributes;
}

export interface FigshareVocabularySyncRunAttributes extends Omit<
  RowFields<SyncRunRow>,
  'branding' | 'crosswalk' | 'localVocabulary' | 'source'
> {
  branding: string | number | BrandingConfigAttributes;
  crosswalk?: string | null | FigshareVocabularyCrosswalkAttributes;
  localVocabulary?: string | null | VocabularyAttributes;
  source?: string | null | FigshareVocabularySourceAttributes;
}

export interface FormAttributes extends PersistenceRow {
  name: string;
  branding: string | number | BrandingConfigAttributes;
  configuration?: FormConfigFrame;
  attachmentFields?: string[];
}

export interface HarvestRecordEventAttributes extends PersistenceRow {
  runId: string;
  chunkId: string;
  brandId: string;
  recordType: string;
  sourceRunId: string;
  harvestId: string;
  oid?: string;
  operation: HarvestOperation | string;
  outcome: HarvestOutcome | string;
  status: boolean;
  message?: string;
  details?: string;
  errorCode?: string;
  recordSnapshot?: Record<string, unknown>;
  createdAt: string;
}

export interface HarvestRunAttributes extends PersistenceRow {
  sourceRunId: string;
  brandId: string;
  recordType: string;
  sourceName: string;
  sourceUri?: string;
  status: HarvestRunStatus | string;
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
  metadata?: Record<string, unknown>;
}

export interface HarvestRunChunkAttributes extends PersistenceRow {
  runId: string;
  brandId: string;
  recordType: string;
  sourceRunId: string;
  contentHash: string;
  attempt?: number;
  chunkIndex?: number;
  chunkLabel?: string;
  totalExpected?: number;
  status: HarvestChunkStatus | string;
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
  responseSummary?: Record<string, unknown>;
}

export interface I18nBundleAttributes extends PersistenceRow {
  branding?: string | number | BrandingConfigAttributes;
  data: Record<string, unknown>;
  displayName?: string;
  enabled?: boolean;
  entries?: unknown[];
  locale: string;
  namespace?: string;
  uid?: string;
}

export interface I18nTranslationAttributes extends PersistenceRow {
  branding?: string | number | BrandingConfigAttributes;
  bundle?: string | number | I18nBundleAttributes;
  category?: string;
  contentFormat?: 'plain' | 'html';
  description?: string;
  key: string;
  locale: string;
  namespace?: string;
  uid?: string;
  value?: unknown;
}

export interface MigrationAttributes extends PersistenceRow {
  name: string;
  source?: string;
  appVersion?: string;
  ranAt: number;
  durationMs?: number;
  executedBy?: string;
}

export interface NamedQueryAttributes extends PersistenceRow {
  brandIdFieldPath?: string;
  branding: string | number | BrandingConfigAttributes;
  collectionName: string;
  key?: string;
  mongoQuery: string;
  name: string;
  queryParams: string;
  resultObjectMapping: string;
  sort?: string;
  expandRelations?: boolean;
  relatedRecordFilters?: string;
}

export interface PathRuleAttributes extends PersistenceRow {
  branding: string | number | BrandingConfigAttributes;
  can_read?: boolean;
  can_write?: boolean;
  custom?: string;
  path: string;
  role: string | number | RoleAttributes;
}

export interface ReportAttributes extends PersistenceRow {
  branding: string | number | BrandingConfigAttributes;
  columns: ReportColumn[];
  databaseQuery?: Record<string, unknown>;
  filter: Record<string, unknown>;
  key?: string;
  name: string;
  reportSource?: string;
  solrQuery?: Record<string, unknown>;
  title: string;
}

export interface RecordTypeAttributes extends PersistenceRow {
  branding: string | number | BrandingConfigAttributes;
  dashboard?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
  key?: string;
  name: string;
  packageType?: string;
  relatedTo?: Record<string, unknown>;
  recordValidation?: RecordTypeValidationConfig;
  concurrentModification?: RecordConcurrentModificationConfig;
  recordSchema?: RecordTypeRecordSchemaConfig;
  searchable?: boolean;
  searchCore?: string;
  searchFilters?: Record<string, unknown>;
  transferResponsibility?: Record<string, unknown>;
  workflowSteps?: unknown[];
}

export interface RoleAttributes extends PersistenceRow {
  branding?: string | number | BrandingConfigAttributes;
  name: string;
  users?: unknown[];
}

export interface SecurityEventAttributes extends PersistenceRow {
  eventId: string;
  brandId: string;
  portalId?: string;
  eventType: string;
  category: string;
  severity: string;
  occurredAt: string;
  source: string;
  actor?: Record<string, unknown>;
  subject?: Record<string, unknown>;
  resource?: Record<string, unknown>;
  requestContext?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  correlationId?: string;
  traceId?: string;
  deliveryState: string;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  nextEligibleAt?: string | null;
  terminalAt?: string | null;
  destinationStates?: Record<string, unknown>;
}

export interface SiemDeliveryAttemptAttributes extends PersistenceRow {
  eventId: string;
  brandId: string;
  destinationId: string;
  adapterType: string;
  attemptNumber: number;
  leaseToken?: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  httpStatusCode?: number;
  responseSummary?: Record<string, unknown>;
  errorSummary?: Record<string, unknown>;
}

export interface ThemeConfigAttributes extends PersistenceRow {
  css?: string;
  name?: string;
}

export interface UserAttributes extends PersistenceRow {
  accountLinkState?: 'active' | 'linked-alias';
  additionalAttributes?: Record<string, unknown>;
  cn?: string;
  displayname?: string;
  edupersonprincipalname?: string;
  edupersonscopedaffiliation?: string;
  edupersontargetedid?: string;
  email: string;
  givenname?: string;
  lastLogin?: string | Date;
  linkedAccountCount?: number;
  linkedPrimaryUserId?: string;
  loginDisabled?: boolean;
  effectiveLoginDisabled?: boolean;
  disabledByPrimaryUserId?: string;
  disabledByPrimaryUsername?: string;
  name: string;
  password?: string;
  roles?: unknown[];
  surname?: string;
  token?: string;
  type: string;
  username: string;
  effectivePrimaryUsername?: string;
  workspaceApps?: unknown[];
}

export interface UserAuditAttributes extends PersistenceRow {
  action: string;
  additionalContext?: Record<string, unknown>;
  user: Record<string, unknown>;
}

export interface UserLinkAttributes extends PersistenceRow {
  primaryUserId: string;
  primaryUsername: string;
  secondaryUserId: string;
  secondaryUsername: string;
  brandId: string;
  status: 'active';
  createdBy: string;
  notes?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface VocabularyAttributes extends Omit<RowFields<VocabularyRow>, 'branding' | 'entries'> {
  branding: string | number | BrandingConfigAttributes;
  entries?: (string | number | VocabularyEntryAttributes)[];
}

export interface VocabularyEntryAttributes extends Omit<RowFields<EntryRow>, 'children' | 'parent' | 'vocabulary'> {
  children?: (string | number | VocabularyEntryAttributes)[];
  parent?: string | number | VocabularyEntryAttributes;
  vocabulary: string | number | VocabularyAttributes;
}

export interface WorkflowStepAttributes extends PersistenceRow {
  config: Record<string, unknown>;
  form?: string | number | FormAttributes;
  hidden?: boolean;
  name: string;
  recordType?: string | number;
  starting: boolean;
}

export interface WorkspaceAppAttributes extends PersistenceRow {
  app: string;
  info?: Record<string, unknown>;
  user: string | number | UserAttributes;
}

export interface WorkspaceAsyncAttributes extends PersistenceRow {
  args: unknown;
  date_completed?: string;
  date_started?: string;
  message?: Record<string, unknown>;
  method: string;
  name: string;
  recordType: string;
  service: string;
  started_by: string;
  status?: string;
}

export interface WorkspaceTypeAttributes extends PersistenceRow {
  branding: string | number | BrandingConfigAttributes;
  description?: string;
  externallyProvisioned?: boolean;
  logo?: string;
  name: string;
  subtitle?: string;
}

export interface ReportColumn {
  label: string;
  property: string;
  exportTemplate?: string;
  hide?: boolean;
  template?: string;
}
