/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { BrandingConfigAttributes } from './BrandingConfig';

export interface RecordTypeAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  dashboard?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
  key?: string;
  name: string;
  packageType?: string;
  relatedTo?: Record<string, unknown>;
  searchable?: boolean;
  searchCore?: string;
  searchFilters?: Record<string, unknown>;
  transferResponsibility?: Record<string, unknown>;
  workflowSteps?: unknown[];
}

export interface RecordTypeWaterlineModel extends Sails.Model<RecordTypeAttributes> {
  attributes: RecordTypeAttributes;
}

declare global {
  var RecordType: RecordTypeWaterlineModel;
}
