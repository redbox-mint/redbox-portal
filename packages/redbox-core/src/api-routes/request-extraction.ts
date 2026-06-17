import { ZodType } from 'zod';

import { ApiRequestDefinition, ApiRequestSource } from './types';
import { coerceValueForSchema, getObjectSchemaShape, getRequestFiles, isPassthroughObjectSchema, isRecord } from './helpers';

export interface ApiRequestExtraction {
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  headers: Record<string, unknown>;
  body: unknown;
  files: Record<string, unknown[]>;
  raw: unknown;
}

function getRequestSourceValue(req: Sails.Req, request: ApiRequestDefinition | undefined, source: ApiRequestSource): unknown {
  const requestRecord = req as unknown as Record<string, unknown>;
  switch (source) {
    case 'params':
      return requestRecord.params;
    case 'query':
      return request?.queryExtractor ? request.queryExtractor(req) : requestRecord.query;
    case 'headers':
      return requestRecord.headers;
    case 'body':
      return request?.extractor ? request.extractor(req) : requestRecord.body;
    default:
      return undefined;
  }
}

function getFieldValue(sourceValue: unknown, key: string): unknown {
  if (!isRecord(sourceValue)) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(sourceValue, key)) {
    return sourceValue[key];
  }
  return undefined;
}

function getLegacyFallbackSources(request: ApiRequestDefinition | undefined, key: string): readonly ApiRequestSource[] {
  const sources = request?.legacyParamFallbacks?.[key];
  return Array.isArray(sources) ? sources : [];
}

function getHeaderValue(req: Sails.Req, name: string): string | undefined {
  const headers = req.headers as Record<string, string | string[] | undefined> | undefined;
  const value = headers == null
    ? undefined
    : Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function getBodyContentTypeForExtraction(req: Sails.Req, contentTypes: string[]): string | undefined {
  const requestContentType = getHeaderValue(req, 'content-type')?.split(';')[0]?.trim().toLowerCase();
  if (!requestContentType) {
    return contentTypes[0];
  }

  return contentTypes.find(contentType => contentType.toLowerCase() === requestContentType) ?? contentTypes[0];
}

export function getRequestValue(
  req: Sails.Req,
  request: ApiRequestDefinition | undefined,
  source: ApiRequestSource,
  key: string
): unknown {
  const primaryValue = getFieldValue(getRequestSourceValue(req, request, source), key);
  if (primaryValue !== undefined) {
    return primaryValue;
  }

  for (const fallbackSource of getLegacyFallbackSources(request, key)) {
    if (fallbackSource === source) {
      continue;
    }
    const fallbackValue = getFieldValue(getRequestSourceValue(req, request, fallbackSource), key);
    if (fallbackValue !== undefined) {
      return fallbackValue;
    }
  }

  return undefined;
}

export function buildRequestSourceInput(
  req: Sails.Req,
  request: ApiRequestDefinition | undefined,
  source: ApiRequestSource,
  schema?: ZodType
): unknown {
  const rawValue = getRequestSourceValue(req, request, source);
  if (!schema) {
    return rawValue;
  }
  const properties = getObjectSchemaShape(schema);
  if (!properties) {
    return coerceValueForSchema(rawValue, schema);
  }
  if (isPassthroughObjectSchema(schema)) {
    return coerceValueForSchema(rawValue, schema);
  }
  const projected = Object.keys(properties).reduce(
    (acc, key) => {
      acc[key] = getRequestValue(req, request, source, key);
      return acc;
    },
    {} as Record<string, unknown>
  );
  return coerceValueForSchema(projected, schema);
}

export function extractApiRequest(req: Sails.Req, request?: ApiRequestDefinition): ApiRequestExtraction {
  const bodyContent = request?.body?.content;
  const bodyContentTypes = bodyContent ? Object.keys(bodyContent) : [];
  const bodyContentType = bodyContent ? getBodyContentTypeForExtraction(req, bodyContentTypes) : undefined;
  const bodySchema = bodyContentType ? bodyContent?.[bodyContentType]?.schema : undefined;
  return {
    params: buildRequestSourceInput(req, request, 'params', request?.params) as Record<string, unknown>,
    query: buildRequestSourceInput(req, request, 'query', request?.query) as Record<string, unknown>,
    headers: buildRequestSourceInput(req, request, 'headers', request?.headers) as Record<string, unknown>,
    body: buildRequestSourceInput(req, request, 'body', bodySchema),
    files: getRequestFiles(req),
    raw: req,
  };
}
