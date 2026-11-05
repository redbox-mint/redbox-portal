import type { RelatedMetadata } from '@researchdatabox/sails-ng-common';
import type { FigshareSourceIntent } from './FigshareSyncModel';

export interface RecordModel {
  [key: string]: unknown;
  redboxOid: string;
  /** Runtime-only detached enrichment; never canonical or persistable record data. */
  relatedMetadata?: RelatedMetadata;
  figshareSyncIntent?: FigshareSourceIntent;
  recordVersion?: number;
  /** Server-owned monotonic aggregate revision. */
  revision?: number;
  /** Durable server-owned identity for this OID's lifecycle incarnation. */
  incarnationId?: string;
  /** Server-owned restore ownership marker used only to finish interrupted lifecycle operations. */
  lifecycleOperationId?: string;
  harvestId: string;
  metaMetadata: RecordMetaMetadata;
  metadata: {
    [key: string]: unknown;
  };
  workflow: RecordWorkflow;
  authorization: RecordAuthorization;
  dateCreated: string;
  lastSaveDate: string;
  id: string;
}

export interface RecordMetaMetadata {
  packageType?: string;
  packageName?: string;
  brandId: string;
  createdBy: string;
  type: string;
  searchCore: string;
  createdOn?: string;
  lastSaveDate?: string;
  form: string;
  attachmentFields: string[];
}

export interface RecordWorkflow {
  stage: string;
  stageLabel: string;
}

export interface StoredRecordAuthorization {
  edit: string[];
  view: string[];
  editRoles: string[];
  viewRoles: string[];
  editPending: string[];
  viewPending: string[];
}

export interface RecordAuthorization extends StoredRecordAuthorization {
  stored: StoredRecordAuthorization;
}
