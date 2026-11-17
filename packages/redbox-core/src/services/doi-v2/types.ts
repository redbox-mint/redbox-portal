import type { RelatedMetadataRequest, RelatedMetadata } from '@researchdatabox/sails-ng-common';
import type { UserModel } from '../../model';
import type { DoiProfile, DoiPublishingConfigData } from '../../configmodels/DoiPublishing';

export interface DoiRecordModel extends Record<string, unknown> {
  redboxOid?: string;
  id?: string;
  branding?: string;
  metaMetadata?: {
    brandId?: string;
  };
  /** Detached, runtime-only mapping input; never persisted by DOI writeback. */
  relatedMetadata?: RelatedMetadata;
  metadata: Record<string, unknown>;
}

export type DoiAction = 'create' | 'update';
export type DoiChangeEvent = 'draft' | 'register' | 'publish' | 'hide';

export interface DoiRunContext {
  recordOid: string;
  brandId: string;
  correlationId: string;
  triggerSource: string;
  jobId?: string;
  profileName?: string;
}

export interface DoiPublishing extends DoiPublishingConfigData {
}

export interface ResolvedDoiProfile {
  name: string;
  profile: DoiProfile;
}

export interface DoiBindingContext {
  record: DoiRecordModel;
  oid: string;
  profile: DoiProfile;
  now: string;
  helpers: {
    mapSubjectEntries: (items: unknown) => Array<Record<string, unknown>>;
  };
}

export interface DoiBindingIterationContext extends DoiBindingContext {
  item: Record<string, unknown>;
  index: number;
}

export interface DoiHttpResult<T = Record<string, unknown>> {
  statusCode: number;
  data: T;
}

export interface DoiOperationResult {
  doi?: string | null;
  statusCode?: number;
  responseSummary?: Record<string, unknown>;
}

/** Server-owned operation options; user is the effective source-read principal. */
export interface DoiRelatedOptions {
  relatedMetadata?: RelatedMetadataRequest;
  user?: UserModel;
}
