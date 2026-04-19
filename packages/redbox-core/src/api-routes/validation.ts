import { ZodIssue, ZodTypeAny } from 'zod';

import { ApiFileConstraint, ApiRequestDefinition, ApiRouteDefinition } from './types';
import { getRequestFiles, isRecord } from './helpers';
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

export interface ApiRouteValidationOptions extends ApiValidationOptions { }

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
    const path = formatIssuePath(issue.path);
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
  schema: ZodTypeAny | undefined,
  prefix: string,
  issues: ApiValidationIssue[]
): void {
  if (!schema) {
    return;
  }
  const value = buildRequestSourceInput(req, request, source, schema);
  const result = schema.safeParse(value);
  if (!result.success) {
    addZodIssues(prefix, result.error.issues, issues);
  }
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

export function validateApiRequest(
  req: Sails.Req,
  request?: ApiRequestDefinition,
  options: ApiValidationOptions = {}
): ApiValidationResult {
  const issues: ApiValidationIssue[] = [];
  if (!request) {
    return { valid: true, issues };
  }

  validateSource(req, request, 'params', request.params, 'params', issues);
  validateSource(req, request, 'query', request.query, 'query', issues);
  validateSource(req, request, 'headers', request.headers, 'headers', issues);

  if (request.body?.required && buildRequestSourceInput(req, request, 'body') == null) {
    issues.push({ path: 'body', message: 'Body is required' });
  }
  if (request.body?.content) {
    const contentTypes = Object.keys(request.body.content);
    const schema = request.body.content[contentTypes[0]]?.schema;
    if (schema) {
      validateSource(req, request, 'body', schema, 'body', issues);
    }
  }

  const files = options.files ?? getRequestFiles(req);
  if (request.files && (options.files != null || Object.keys(files).length > 0)) {
    validateFiles(files, request.files, issues);
  }

  return { valid: issues.length === 0, issues };
}

export interface ValidatedApiRequest {
  valid: true;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
  files: Record<string, unknown[]>;
}

export interface InvalidApiRequest {
  valid: false;
  issues: ApiValidationIssue[];
}

export type ApiRouteRequestResult = ValidatedApiRequest | InvalidApiRequest;

export type ValidatedApiRouteRequest = Omit<ValidatedApiRequest, 'valid'>;

export function validateApiRouteRequest(
  req: Sails.Req,
  route: ApiRouteDefinition,
  options: ApiRouteValidationOptions = {}
): ApiRouteRequestResult {
  const validation = validateApiRequest(req, route.request, options);
  if (!validation.valid) {
    return { valid: false, issues: validation.issues };
  }
  const extracted = extractApiRequest(req, route.request);
  return {
    valid: true,
    params: extracted.params,
    query: extracted.query,
    body: extracted.body,
    files: options.files ?? extracted.files,
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

export function getValidatedApiRequest(req: Sails.Req): ValidatedApiRouteRequest {
  if (!req.apiRequest) {
    throw new Error(`Missing validated API request context for ${String(req.method).toUpperCase()} ${req.path ?? req.originalUrl}`);
  }
  return req.apiRequest;
}
