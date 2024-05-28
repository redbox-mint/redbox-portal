export interface RecordModel {
    redboxOid: string;
    harvestId: string;
    metaMetadata: RecordMetaMetadata;
    metadata: {
        [key: string]: any;
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
    name: string;
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