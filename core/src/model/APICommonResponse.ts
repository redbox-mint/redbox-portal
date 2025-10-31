import {ErrorResponseItemV2} from "./api";
import {MetaResponseItemV2} from "./api/APIResponseVersion2";

export const APICommonFormat = ['jsonAjax', 'json', 'plainText'] as const;
export type APICommonFormatType = typeof APICommonFormat[number];

export interface APICommonResponseType {
  format?: APICommonFormatType;
  data?: unknown;
  errors?: Error[];
  structuredErrors?: ErrorResponseItemV2[];
  meta?: MetaResponseItemV2;
}

export class APICommonResponse implements APICommonResponseType {
  format: APICommonFormatType;
  data: unknown;
  errors: Error[];
  structuredErrors: ErrorResponseItemV2[];
  meta: MetaResponseItemV2;

  constructor({format = 'json', data, errors = [], structuredErrors = [], meta = {}}: APICommonResponseType = {}) {
    this.format = format;
    this.data = data;
    this.errors = errors;
    this.structuredErrors = structuredErrors;
    this.meta = meta;
  }
}
