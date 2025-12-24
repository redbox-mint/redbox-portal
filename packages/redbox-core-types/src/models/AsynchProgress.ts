// This file is generated from internal/typescript-models/src/models/AsynchProgress.ts. Do not edit directly.
/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { BrandingConfigAttributes } from './BrandingConfig';

export interface AsynchProgressAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  currentIdx?: number;
  date_completed?: string;
  date_started?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  name: string;
  relatedRecordId?: string;
  started_by: string;
  status?: string;
  targetIdx?: number;
  taskType?: string;
}

export interface AsynchProgressWaterlineModel extends Sails.Model<AsynchProgressAttributes> {
  attributes: AsynchProgressAttributes;
}

declare global {
  var AsynchProgress: AsynchProgressWaterlineModel;
}
