// This file is generated from internal/typescript-models/src/models/Record.ts. Do not edit directly.
/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface RecordAttributes extends Sails.WaterlineAttributes {
  authorization?: JsonMap;
  dateCreated?: string;
  harvestId?: string;
  lastSaveDate?: string;
  metadata?: JsonMap;
  metaMetadata?: JsonMap;
  redboxOid?: string;
  workflow?: JsonMap;
}

export interface RecordWaterlineModel extends Sails.Model<RecordAttributes> {
  attributes: RecordAttributes;
}

declare global {
  var Record: RecordWaterlineModel;
}
