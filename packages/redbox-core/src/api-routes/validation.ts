import { ZodIssue, ZodType } from 'zod';

import { ApiFileConstraint, ApiRequestDefinition, ApiRouteDefinition } from './types';
import { isRecord, isStrictObjectSchema } from './helpers';
import { buildRequestSourceInput, extractApiRequest } from './request-extraction';

export interface ApiValidationIssue {
  path: string;
  message: string;
}

export interface ApiValidationResult {
  valid: boolean;
  issues: ApiValidationIssue[];
}

export interface ApiValidationOptions {
  files?: Record<string, unknown[]>;
}

export interface ApiRouteValidationOptions extends ApiValidationOptions {}

function formatIssuePath(path: (string | number)[]): string {
  if (!path.length) {
    return '';
  }
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') {
      return `${acc}[${segment}]`;
    }
    return acc ? `${acc}.${segment}` : String(segment);
  }, '');
}

function addZodIssues(prefix: string, issues: ZodIssue[], output: ApiValidationIssue[]): void {
  for (const issue of issues) {
    const path = formatIssuePath(issue.path as (string | number)[]);
    output.push({
      path: path ? `${prefix}.${path}` : prefix,
      message: issue.message,
    });
  }
}

function validateSource(
  req: Sails.Req,
  request: ApiRequestDefinition,
  source: 'params' | 'query' | 'headers' | 'body',
  schema: ZodType | undefined,
  prefix: string,
  issues: ApiValidationIssue[]
): unknown {
  if (!schema) {
    return buildRequestSourceInput(req, request, source);
  }
  // Validate strict request bodies before field projection so they can reject
  // undeclared authority-bearing properties. Other sources still need projection
  // because the framework adds fields that are not part of each action's contract.
  const value =
    source === 'body' && isStrictObjectSchema(schema)
      ? buildRequestSourceInput(req, request, source)
      : buildRequestSourceInput(req, request, source, schema);
  const result = schema.safeParse(value);
  if (!result.success) {
    addZodIssues(prefix, result.error.issues, issues);
    return value;
  }
  return result.data;
}

function validateFiles(
  files: Record<string, unknown[]>,
  constraints: Record<string, ApiFileConstraint>,
  issues: ApiValidationIssue[]
): void {
  for (const [name, constraint] of Object.entries(constraints)) {
    const uploaded = files[name] ?? [];
    if (constraint.required && uploaded.length === 0) {
      issues.push({ path: `files.${name}`, message: 'File is required' });
      continue;
    }
    if (!uploaded.length) {
      continue;
    }
    if (constraint.multiple !== true && uploaded.length > 1) {
      issues.push({ path: `files.${name}`, message: 'Only one file is allowed' });
      continue;
    }

    for (let index = 0; index < uploaded.length; index += 1) {
      const file = uploaded[index];
      if (!isRecord(file)) {
        continue;
      }
      const sizeValue = file.size ?? file.bytes;
      const size =
        typeof sizeValue === 'number' ? sizeValue : typeof sizeValue === 'string' ? Number(sizeValue) : undefined;
      if (
        constraint.maxBytes != null &&
        typeof size === 'number' &&
        Number.isFinite(size) &&
        size > constraint.maxBytes
      ) {
        issues.push({ path: `files.${name}[${index}]`, message: `File exceeds maxBytes ${constraint.maxBytes}` });
      }

      const contentType = [file.type, file.mimetype, file.mimeType, file.contentType].find(
        value => typeof value === 'string' && value.trim() !== ''
      ) as string | undefined;
      if (constraint.mimeTypes?.length && contentType && !constraint.mimeTypes.includes(contentType)) {
        issues.push({ path: `files.${name}[${index}]`, message: `Unsupported mime type ${contentType}` });
      }
    }
  }
}

function getHeaderValue(req: Sails.Req, name: string): string | string[] | undefined {
  const headers = req.headers as Record<string, string | string[] | undefined> | undefined;
  return headers == null
    ? undefined
    : Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

function getBodyContentType(req: Sails.Req, contentTypes: string[]): string | undefined {
  const contentTypeHeader = getHeaderValue(req, 'content-type');
  const requestContentType =
    typeof contentTypeHeader === 'string' ? contentTypeHeader.split(';')[0]?.trim().toLowerCase() : undefined;
  if (!requestContentType) {
    return contentTypes[0];
  }

  return contentTypes.find(contentType => contentType.toLowerCase() === requestContentType) ?? contentTypes[0];
}

interface ParsedApiRequest {
  readonly params: Record<string, unknown>;
  readonly query: Record<string, unknown>;
  readonly headers: Record<string, unknown>;
  readonly body: unknown;
  readonly files: Record<string, unknown[]>;
}

function validateAndParseApiRequest(
  req: Sails.Req,
  request?: ApiRequestDefinition,
  options: ApiValidationOptions = {}
): { readonly issues: ApiValidationIssue[]; readonly request: ParsedApiRequest } {
  const issues: ApiValidationIssue[] = [];
  if (!request) {
    const extracted = extractApiRequest(req);
    return { issues, request: extracted };
  }

  const extracted = extractApiRequest(req, request);
  const params = validateSource(req, request, 'params', request.params, 'params', issues) as Record<string, unknown>;
  const query = validateSource(req, request, 'query', request.query, 'query', issues) as Record<string, unknown>;
  const headers = validateSource(req, request, 'headers', request.headers, 'headers', issues) as Record<
    string,
    unknown
  >;

  if (request.body?.required && buildRequestSourceInput(req, request, 'body') == null) {
    issues.push({ path: 'body', message: 'Body is required' });
  }
  let body = extracted.body;
  if (request.body?.content) {
    const contentTypes = Object.keys(request.body.content);
    const contentType = getBodyContentType(req, contentTypes);
    const schema = contentType ? request.body.content[contentType]?.schema : undefined;
    if (schema) {
      body = validateSource(req, request, 'body', schema, 'body', issues);
    }
  }

  const files = options.files ?? extracted.files;
  if (request.files && (options.files != null || Object.keys(files).length > 0)) {
    validateFiles(files, request.files, issues);
  }

  return { issues, request: { params, query, headers, body, files } };
}

export function validateApiRequest(
  req: Sails.Req,
  request?: ApiRequestDefinition,
  options: ApiValidationOptions = {}
): ApiValidationResult {
  const { issues } = validateAndParseApiRequest(req, request, options);
  return { valid: issues.length === 0, issues };
}

export interface ValidatedApiRequest {
  valid: true;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  /** Present for contract-validated HTTP requests; optional for legacy in-process adapters. */
  headers?: Record<string, unknown>;
  body: unknown;
  files: Record<string, unknown[]>;
}

export interface InvalidApiRequest {
  valid: false;
  issues: ApiValidationIssue[];
}

export type ApiRouteRequestResult = ValidatedApiRequest | InvalidApiRequest;

export type ValidatedApiRouteRequest<
  Params extends Record<string, unknown> = Record<string, unknown>,
  Query extends Record<string, unknown> = Record<string, unknown>,
  Body = unknown,
  Headers extends Record<string, unknown> = Record<string, unknown>,
> = Omit<ValidatedApiRequest, 'valid' | 'params' | 'query' | 'body' | 'headers'> & {
  params: Params;
  query: Query;
  body: Body;
  headers?: Headers;
};

export function validateApiRouteRequest(
  req: Sails.Req,
  route: ApiRouteDefinition,
  options: ApiRouteValidationOptions = {}
): ApiRouteRequestResult {
  const validated = validateAndParseApiRequest(req, route.request, options);
  if (validated.issues.length > 0) {
    return { valid: false, issues: validated.issues };
  }
  return {
    valid: true,
    ...validated.request,
  };
}

export function validateApiRouteFiles(
  route: ApiRouteDefinition,
  files: Record<string, unknown[]>
): ApiValidationResult {
  const issues: ApiValidationIssue[] = [];
  if (route.request?.files) {
    validateFiles(files, route.request.files, issues);
  }
  return { valid: issues.length === 0, issues };
}

export function getValidatedApiRequest<
  Params extends Record<string, unknown> = Record<string, unknown>,
  Query extends Record<string, unknown> = Record<string, unknown>,
  Body = unknown,
  Headers extends Record<string, unknown> = Record<string, unknown>,
>(req: Sails.Req): ValidatedApiRouteRequest<Params, Query, Body, Headers> {
  if (!req.apiRequest) {
    throw new Error(
      `Missing validated API request context for ${String(req.method).toUpperCase()} ${req.path ?? req.originalUrl}`
    );
  }
  return req.apiRequest as ValidatedApiRouteRequest<Params, Query, Body, Headers>;
}
