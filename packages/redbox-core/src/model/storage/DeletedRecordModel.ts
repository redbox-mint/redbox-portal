import {RecordModel} from './RecordModel';
export interface DeletedRecordModel {
    redboxOid: string;
    deletedRecordMetadata: RecordModel;
    dateDeleted: string;
}