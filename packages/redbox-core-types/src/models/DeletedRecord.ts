// This file is generated from internal/typescript-models/src/models/DeletedRecord.ts. Do not edit directly.
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
