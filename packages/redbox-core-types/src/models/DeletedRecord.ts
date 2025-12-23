/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface DeletedRecordAttributes extends Sails.WaterlineAttributes {
  dateDeleted?: string;
  deletedRecordMetadata?: Record<string, unknown>;
  redboxOid?: string;
}

export interface DeletedRecordWaterlineModel extends Sails.Model<DeletedRecordAttributes> {
  attributes: DeletedRecordAttributes;
}

declare global {
  var DeletedRecord: DeletedRecordWaterlineModel;
}
