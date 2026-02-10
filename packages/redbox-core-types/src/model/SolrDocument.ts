import { RecordMetaMetadata, RecordWorkflow, RecordAuthorization, RecordModel } from "./storage/RecordModel";

//The same as RecordModel but adding storage_id hence it needs to be maintained in sync with RecordModel
export class SolrDocument {
    redboxOid: string;
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
    storage_id: string;

    constructor(record :RecordModel) {
        this.redboxOid = record.redboxOid;
        this.harvestId = record.harvestId;
        this.metaMetadata = record.metaMetadata;
        this.metadata = record.metadata;
        this.workflow = record.workflow;
        this.authorization = record.authorization;
        this.dateCreated = record.dateCreated;
        this.lastSaveDate = record.lastSaveDate;
        this.id = record.id;
        this.storage_id = record.id;
    }
}