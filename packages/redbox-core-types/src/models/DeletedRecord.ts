/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface DeletedRecordAttributes {
  dateDeleted?: string;
  deletedRecordMetadata?: JsonMap;
  redboxOid?: string;
}

export interface DeletedRecordWaterlineModel extends Sails.Model {
  attributes: DeletedRecordAttributes;
}

declare global {
  var DeletedRecord: DeletedRecordWaterlineModel;
}
