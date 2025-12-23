/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface RecordAuditAttributes {
  action?: string;
  dateCreated?: string;
  record?: JsonMap;
  user?: JsonMap;
}

export interface RecordAuditWaterlineModel extends Sails.Model {
  attributes: RecordAuditAttributes;
}

declare global {
  var RecordAudit: RecordAuditWaterlineModel;
}
