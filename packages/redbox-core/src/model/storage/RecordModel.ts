export interface RecordModel {
  [key: string]: unknown;
  redboxOid: string;
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
