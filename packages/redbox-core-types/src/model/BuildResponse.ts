import {ErrorResponseItemV2} from "./api";
import {MetaResponseItemV2} from "./api/APIResponseVersion2";

export const BuildResponseFormat = ['json',] as const;
export type BuildResponseFormatType = typeof BuildResponseFormat[number];

/**
 * The parts that can be specified to build a response.
 */
export interface BuildResponseType {
  /**
   * The format of the content of the response.
   */
  format?: BuildResponseFormatType;
  /**
   * The response payload data.
   */
  data?: unknown;
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
}
