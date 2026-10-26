import type { ApiRequestInput } from './types';
import {
  ZodArray,
  ZodBoolean,
  ZodIntersection,
  ZodNullable,
  ZodNumber,
  ZodObject,
  ZodRawShape,
  ZodOptional,
  ZodType,
  ZodUnion,
  z,
} from 'zod';
import UrlPattern from 'url-pattern';

import { auth as defaultAuthConfig } from '../config/auth.config';

import {
  ApiFileConstraint,
  ApiRequestDefinition,
  ApiRouteDefinition,
  ApiRouteDefinitionMap,
  ApiSchemaField,
  HttpMethod,
} from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return fallback;
}

export function trimString(value: unknown): string {
  return asString(value).trim();
}

export function toArray<T>(value: T | readonly T[] | null | undefined): T[] {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? ([...value] as T[]) : [value as T];
}

export function normalizeMethod(method: HttpMethod | string): HttpMethod {
  return String(method).toLowerCase() as HttpMethod;
}

export type RequestSource = 'params' | 'query' | 'headers' | 'body';

export function routeKey(method: HttpMethod | string, path: string): string {
  return `${normalizeMethod(method)} ${path}`;
}

export type AuthRuleLike = {
  path: string;
  role: string;
  can_read?: boolean;
  can_update?: boolean;
};

function isAuthRuleLike(rule: unknown): rule is AuthRuleLike {
  return isRecord(rule) && typeof rule.path === 'string' && typeof rule.role === 'string';
}

function getAuthRules(): AuthRuleLike[] {
  return defaultAuthConfig.rules.filter(isAuthRuleLike);
}

function getRouteSegmentVariants(segment: string): Array<string | null> {
  if (segment.startsWith(':')) {
    return segment.endsWith('?') ? ['sample', null] : ['sample'];
  }

  if (segment.includes('*')) {
    return ['sample', null];
  }

  return [segment];
}

function getRoutePathVariants(path: string): string[] {
  const segments = path.split('/').filter(Boolean);
  let variants: string[][] = [[]];

  for (const segment of segments) {
    const nextVariants: string[][] = [];
    for (const variant of variants) {
      for (const segmentVariant of getRouteSegmentVariants(segment)) {
        if (segmentVariant == null) {
          nextVariants.push([...variant]);
        } else {
          nextVariants.push([...variant, segmentVariant]);
        }
      }
    }
    variants = nextVariants;
  }

  return variants.map(variant => `/${variant.join('/')}`);
}

export function getRedboxRoleExtension(
  path: string,
  rules: readonly AuthRuleLike[] = getAuthRules()
): Record<string, unknown> | undefined {
  const roles: string[] = [];
  const seenRoles = new Set<string>();
  const routePathVariants = getRoutePathVariants(path);

  for (const rule of rules) {
    const pattern = new UrlPattern(rule.path);
    if (!routePathVariants.some(routePathVariant => pattern.match(routePathVariant) != null)) {
      continue;
    }
    if (rule.can_read !== true && rule.can_update !== true) {
      continue;
    }
    if (seenRoles.has(rule.role)) {
      continue;
    }

    seenRoles.add(rule.role);
    roles.push(rule.role);
  }

  return roles.length ? { 'x-redbox-roles': roles } : undefined;
}

function describeRoute(route: ApiRouteDefinition): string {
  return `${String(route.method).toUpperCase()} ${route.path} (${route.controller}#${route.action})`;
}

export function ensureUniqueApiRoutes(
  routes: readonly ApiRouteDefinition[],
  context = 'API routes'
): readonly ApiRouteDefinition[] {
  const seenRoutes = new Map<string, ApiRouteDefinition>();
  for (const route of routes) {
    const key = routeKey(route.method, route.path);
    const previousRoute = seenRoutes.get(key);
    if (previousRoute) {
      throw new Error(
        `Duplicate API route detected in ${context}: ${describeRoute(previousRoute)} conflicts with ${describeRoute(route)}`
      );
    }
    seenRoutes.set(key, route);
  }
  return routes;
}

export function toRouteMap(routes: readonly ApiRouteDefinition[]): ApiRouteDefinitionMap {
  return ensureUniqueApiRoutes(routes, 'route map').reduce((acc, route) => {
    acc[routeKey(route.method, route.path)] = route;
    return acc;
  }, {} as ApiRouteDefinitionMap);
}

function getRecordValue(source: unknown, key: string): unknown {
  if (!isRecord(source)) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(source, key)) {
    return source[key];
  }
  return undefined;
}

function getHeaderValue(headers: unknown, key: string): unknown {
  if (!isRecord(headers)) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(headers, key)) {
    return headers[key];
  }
  const normalizedKey = key.toLowerCase();
  for (const [candidateKey, value] of Object.entries(headers)) {
    if (candidateKey.toLowerCase() === normalizedKey) {
      return value;
    }
  }
  return undefined;
}

export function extractFromSource(req: ApiRequestInput, source: RequestSource, key: string): unknown {
  const request = req as unknown as Record<string, unknown>;
  switch (source) {
    case 'params':
      return getRecordValue(request.params, key);
    case 'query':
      return getRecordValue(request.query, key);
    case 'headers':
      return getHeaderValue(request.headers, key);
    case 'body':
      return getRecordValue(request.body, key);
    default:
      return undefined;
  }
}

export function getRequestFiles(req: ApiRequestInput): Record<string, unknown[]> {
  const request = req as unknown as Record<string, unknown>;
  const files = request.files;
  if (Array.isArray(files)) {
    return { files };
  }
  if (isRecord(files)) {
    return files as Record<string, unknown[]>;
  }
  return {};
}

export function getFileConstraintDescription(name: string, constraint: ApiFileConstraint): string {
  const parts: string[] = [constraint.description ?? `${name} upload`];
  if (constraint.maxBytes != null) {
    parts.push(`maxBytes=${constraint.maxBytes}`);
  }
  if (constraint.mimeTypes?.length) {
    parts.push(`mimeTypes=${constraint.mimeTypes.join(',')}`);
  }
  return parts.join(' | ');
}

export function getFileConstraintOpenApiExtension(constraint: ApiFileConstraint): Record<string, unknown> {
  const extension: Record<string, unknown> = {};
  if (constraint.maxBytes != null) {
    extension['x-maxBytes'] = constraint.maxBytes;
  }
  if (constraint.mimeTypes?.length) {
    extension['x-mimeTypes'] = [...constraint.mimeTypes];
  }
  return extension;
}

export function ensureSchemaObject(field: ApiSchemaField | undefined): ApiSchemaField {
  if (field) {
    return field;
  }
  return z.object({}).passthrough();
}

export function routeExtractor(route: ApiRequestDefinition | undefined, req: ApiRequestInput): unknown {
  if (!route?.extractor) {
    return undefined;
  }
  return route.extractor(req);
}

export function getObjectSchemaShape(schema: ApiSchemaField | undefined): Record<string, ApiSchemaField> | undefined {
  if (!(schema instanceof ZodObject)) {
    return undefined;
  }
  return schema.shape;
}

export function isZodObjectSchema(schema: ApiSchemaField | undefined): schema is ZodObject<ZodRawShape> {
  return schema instanceof ZodObject;
}

export function isPassthroughObjectSchema(schema: ZodType): schema is ZodObject<ZodRawShape> {
  return (
    schema instanceof ZodObject &&
    'catchall' in schema._zod.def &&
    (schema._zod.def as { catchall?: { type: string } }).catchall?.type === 'unknown'
  );
}

export function isOptionalSchema(schema: ZodType): boolean {
  return schema instanceof ZodOptional;
}

function isIntegerSchema(schema: ZodType): boolean {
  return (
    schema instanceof ZodNumber &&
    (schema._zod.def as { checks?: Array<{ format?: string }> }).checks?.some(check => check.format === 'safeint') ===
      true
  );
}

function coercePrimitiveValue(value: unknown, schema: ZodType): unknown {
  if (schema instanceof ZodBoolean) {
    if (typeof value === 'string' && /^(true|false)$/i.test(value.trim())) {
      return value.trim().toLowerCase() === 'true';
    }
    return value;
  }
  if (schema instanceof ZodNumber) {
    if (typeof value === 'string' && value.trim() !== '') {
      const coerced = Number(value);
      if (Number.isFinite(coerced)) {
        return isIntegerSchema(schema) ? Math.trunc(coerced) : coerced;
      }
    }
    return value;
  }
  return value;
}

export function coerceValueForSchema(value: unknown, schema: ZodType): unknown {
  if (value == null) {
    return value;
  }

  if (isOptionalSchema(schema)) {
    return coerceValueForSchema(value, (schema as unknown as { unwrap: () => ZodType }).unwrap());
  }

  if (schema instanceof ZodNullable) {
    return coerceValueForSchema(value, (schema as unknown as { unwrap: () => ZodType }).unwrap());
  }

  if (schema instanceof ZodObject) {
    if (!isRecord(value)) {
      return value;
    }
    const shape = schema.shape;
    const result: Record<string, unknown> = {};
    for (const [key, childSchema] of Object.entries(shape)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        result[key] = coerceValueForSchema(value[key], childSchema as unknown as ZodType);
      }
    }
    if (isPassthroughObjectSchema(schema)) {
      for (const [key, childValue] of Object.entries(value)) {
        if (!Object.prototype.hasOwnProperty.call(shape, key)) {
          result[key] = childValue;
        }
      }
    }
    return result;
  }

  if (schema instanceof ZodArray && Array.isArray(value)) {
    return value.map(item => coerceValueForSchema(item, schema.element as unknown as ZodType));
  }

  if (schema instanceof ZodUnion) {
    return value;
  }

  if (schema instanceof ZodIntersection) {
    return value;
  }

  return coercePrimitiveValue(value, schema);
}
