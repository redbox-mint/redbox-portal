/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface RecordTypeAttributes {
  branding: string | number;
  dashboard?: JsonMap;
  hooks?: JsonMap;
  key?: string;
  name: string;
  packageType?: string;
  relatedTo?: JsonMap;
  searchable?: boolean;
  searchCore?: string;
  searchFilters?: JsonMap;
  transferResponsibility?: JsonMap;
  workflowSteps?: unknown[];
}

export interface RecordTypeWaterlineModel extends Sails.Model {
  attributes: RecordTypeAttributes;
}

declare global {
  var RecordType: RecordTypeWaterlineModel;
}
