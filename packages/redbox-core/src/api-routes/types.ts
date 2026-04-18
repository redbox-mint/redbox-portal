import type { ZodTypeAny } from 'zod';

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head';
export type ApiRequestSource = 'params' | 'query' | 'headers' | 'body';

export type ApiSchemaField = ZodTypeAny;

export interface ApiFileConstraint {
  required?: boolean;
  maxBytes?: number;
  mimeTypes?: readonly string[];
  multiple?: boolean;
  description?: string;
}

export interface ApiRequestBodyContent {
  schema?: ApiSchemaField;
  encoding?: Record<string, unknown>;
  description?: string;
}

export interface ApiRequestBodyDefinition {
  required?: boolean;
  content: Record<string, ApiRequestBodyContent>;
}

export interface ApiRequestDefinition {
  params?: ApiSchemaField;
  query?: ApiSchemaField;
  headers?: ApiSchemaField;
  body?: ApiRequestBodyDefinition;
  files?: Record<string, ApiFileConstraint>;
  extractor?: (req: Sails.Req) => unknown;
  queryExtractor?: (req: Sails.Req) => unknown;
  legacyParamFallbacks?: Partial<Record<string, readonly ApiRequestSource[]>>;
}

export interface ApiResponseContent {
  schema?: ApiSchemaField;
  description?: string;
  example?: unknown;
  headers?: Record<string, ApiSchemaField>;
}

export interface ApiResponseDefinition {
  description: string;
  content?: Record<string, ApiResponseContent>;
  headers?: Record<string, ApiSchemaField>;
}

export interface ApiOpenApiMetadata {
  tags?: readonly string[];
  summary?: string;
  description?: string;
  operationId?: string;
  request?: ApiRequestDefinition;
  responses?: Record<number, ApiResponseDefinition>;
  security?: readonly Record<string, readonly string[]>[];
  extensions?: Record<string, unknown>;
}

export interface ApiRouteDefinition extends ApiOpenApiMetadata {
  method: HttpMethod;
  path: string;
  controller: string;
  action: string;
  csrf?: boolean;
  policy?: string;
  skipAssets?: boolean;
  locals?: Record<string, unknown>;
  view?: string;
}

export interface ApiRouteGroup {
  name: string;
  routes: readonly ApiRouteDefinition[];
}

export type ApiRouteProvider = () => readonly ApiRouteDefinition[] | ApiRouteDefinition[];

export type ApiRouteDefinitionMap = Record<string, ApiRouteDefinition>;
export type ApiRouteMap = Record<string, unknown>;
