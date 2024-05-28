import {RecordModel} from './RecordModel';
interface DeletedRecordModel {
    redboxOid: string;
    deletedRecordMetadata: RecordModel;
    dateDeleted: string;
  }