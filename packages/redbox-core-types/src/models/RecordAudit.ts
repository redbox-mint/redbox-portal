// This file is generated from internal/typescript-models/src/models/RecordAudit.ts. Do not edit directly.
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
