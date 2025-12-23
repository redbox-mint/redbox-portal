/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface RecordAuditAttributes extends Sails.WaterlineAttributes {
  action?: string;
  dateCreated?: string;
  record?: Record<string, unknown>;
  user?: Record<string, unknown>;
}

export interface RecordAuditWaterlineModel extends Sails.Model<RecordAuditAttributes> {
  attributes: RecordAuditAttributes;
}

declare global {
  var RecordAudit: RecordAuditWaterlineModel;
}
