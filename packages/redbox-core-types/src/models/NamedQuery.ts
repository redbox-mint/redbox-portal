// This file is generated from internal/typescript-models/src/models/NamedQuery.ts. Do not edit directly.
/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { BrandingConfigAttributes } from './BrandingConfig';

export interface NamedQueryAttributes extends Sails.WaterlineAttributes {
  brandIdFieldPath?: string;
  branding: string | number | BrandingConfigAttributes;
  collectionName: string;
  key?: string;
  mongoQuery: string;
  name: string;
  queryParams: string;
  resultObjectMapping: string;
}

export interface NamedQueryWaterlineModel extends Sails.Model<NamedQueryAttributes> {
  attributes: NamedQueryAttributes;
}

declare global {
  var NamedQuery: NamedQueryWaterlineModel;
}
