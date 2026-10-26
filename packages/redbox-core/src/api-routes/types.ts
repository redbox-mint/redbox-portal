import type { ZodType } from 'zod';

/** Transport data consumed by contracts; no Sails helpers or mutable Express query required. */
export interface ApiRequestInput {
  readonly params?: Record<string, unknown>;
  readonly query?: Record<string, unknown>;
  readonly headers?: Record<string, string | string[] | undefined>;
  readonly body?: unknown;
  readonly files?: unknown;
  readonly method?: string;
  readonly path?: string;
  readonly originalUrl?: string;
  readonly route?: unknown;
  readonly options?: Record<string, unknown>;
  readonly apiRequest?: import('./validation').ValidatedApiRouteRequest;
}

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head';
export type ApiRequestSource = 'params' | 'query' | 'headers' | 'body';

export type ApiSchemaField = ZodType;

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
  extractor?: (req: ApiRequestInput) => unknown;
  queryExtractor?: (req: ApiRequestInput) => unknown;
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
  includeDefaultResponses?: boolean;
  security?: readonly Record<string, readonly string[]>[];
  extensions?: Record<string, unknown>;
}

export interface ApiRouteDefinition extends ApiOpenApiMetadata {
  method: HttpMethod;
  path: string;
  controller: string;
  action: string;
  csrf?: boolean;
  policy?: string | string[];
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
