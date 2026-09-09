import {ErrorResponseItemV2} from "./api";
import {MetaResponseItemV2} from "./api/APIResponseVersion2";
import type { PublishedRecordJsonSchemaDocument } from '../record-contract/record-json-schema-artifact';
import type { ContractJsonObject } from '../record-contract/types';

export const BuildResponseFormat = ['json', 'raw-json'] as const;
export type BuildResponseFormatType = typeof BuildResponseFormat[number];
export const RawJsonResponseMediaTypes = ['application/schema+json', 'application/problem+json'] as const;
export type RawJsonResponseMediaType = typeof RawJsonResponseMediaTypes[number];

/**
 * Common response controls retained by both enveloped and raw JSON responses.
 */
interface BuildResponseCommon {
  /**
   * The overall HTTP response status.
   */
  status?: number;
  /**
   * Response headers.
   */
  headers?: { [key: string]: string };
  /**
   * Internal errors.
   * These will be logged.
   * They are not included in the response.
   */
  errors?: Error[];
}

/** The existing API-version-aware JSON response contract. */
export interface BuildJsonResponseType extends BuildResponseCommon {
  format?: 'json';
  data?: unknown;
  mediaType?: never;
  /**
   * Structured detail errors.
   * These are included in the response.
   */
  displayErrors?: ErrorResponseItemV2[];
  /**
   * Additional content to add to the response.
   */
  meta?: MetaResponseItemV2;
  /**
   * The payload to use for responses in the API V1 structure.
   */
  v1?: unknown;
  /**
   * Optional additive payload for v2 responses.
   */
  prehydrate?: unknown;
}

/** A deliberately narrow raw JSON response for schema and Problem Details documents. */
export interface BuildRawJsonResponseType extends BuildResponseCommon {
  format: 'raw-json';
  mediaType: RawJsonResponseMediaType;
  data: ContractJsonObject | PublishedRecordJsonSchemaDocument;
  displayErrors?: never;
  meta?: never;
  v1?: never;
  prehydrate?: never;
}

export type BuildResponseType = BuildJsonResponseType | BuildRawJsonResponseType;
