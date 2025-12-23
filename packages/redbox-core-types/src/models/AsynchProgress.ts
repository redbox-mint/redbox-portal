/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface AsynchProgressAttributes {
  branding: string | number;
  currentIdx?: number;
  date_completed?: string;
  date_started?: string;
  message?: string;
  metadata?: JsonMap;
  name: string;
  relatedRecordId?: string;
  started_by: string;
  status?: string;
  targetIdx?: number;
  taskType?: string;
}

export interface AsynchProgressWaterlineModel extends Sails.Model {
  attributes: AsynchProgressAttributes;
}

declare global {
  var AsynchProgress: AsynchProgressWaterlineModel;
}
