// This file is generated from internal/sails-ts/api/services/NamedQueryService.ts. Do not edit directly.
import { Services as services } from '../../index';
import {
  Sails,
  Model
} from "sails";
import { DateTime } from 'luxon';
import { ListAPIResponse } from '../../index';
import { Observable, firstValueFrom } from 'rxjs';

export enum DataType {
  Date = 'date',
  Number = 'number',
  String = 'string',
}
export enum NamedQueryWhenUndefinedOptions {
  defaultValue = 'defaultValue',
  ignore = "ignore"
}
export enum NamedQueryFormatOptions {
  days = 'days',
  ISODate = 'ISODate'
}
export type NamedQuerySortConfig = Record<string, "ASC" | "DESC">[];
declare class QueryParameterDefinition {
  required: boolean;
  type: DataType;
  defaultValue: any;
  queryType: string;
  whenUndefined: NamedQueryWhenUndefinedOptions;
  format: NamedQueryFormatOptions;
  path: string;
  template: string;
}
export declare class NamedQueryConfig {
  name: string;
  branding: string;
  metadata: any;
  createdAt: string;
  updatedAt: string;
  key: string;
  queryParams: Map<string,QueryParameterDefinition>;
  mongoQuery: object;
  collectionName: string;
  resultObjectMapping: any;
  brandIdFieldPath: string;
  sort: NamedQuerySortConfig | undefined;
  constructor(values: any);
}
export declare class NamedQueryResponseRecord {
  oid: string;
  title: string;
  metadata: any;
  lastSaveDate: string;
  dateCreated: string;
  constructor(values: any);
}

export interface NamedQueryService {
  bootstrap(defBrand: any): any;
  getNamedQueryConfig(brand: any, namedQuery: any): any;
  performNamedQuery(brandIdFieldPath: any, resultObjectMapping: any, collectionName: any, mongoQuery: any, queryParams: any, paramMap: any, brand: any, start: any, rows: any, user?: any, sort?: NamedQuerySortConfig | undefined): Promise<ListAPIResponse<Object>>;
  performNamedQueryFromConfig(config: NamedQueryConfig, paramMap: any, brand: any, start: any, rows: any, user?: any): any;
  performNamedQueryFromConfigResults(config: NamedQueryConfig, paramMap: Record<string, string>, brand: any, queryName: string, start?: number, rows?: number, maxRecords?: number, user?: any): any;
}
