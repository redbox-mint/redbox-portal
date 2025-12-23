/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface ReportAttributes {
  branding: string | number;
  columns: JsonMap;
  databaseQuery?: JsonMap;
  filter: JsonMap;
  key?: string;
  name: string;
  reportSource?: string;
  solrQuery?: JsonMap;
  title: string;
}

export interface ReportWaterlineModel extends Sails.Model {
  attributes: ReportAttributes;
}

declare global {
  var Report: ReportWaterlineModel;
}
