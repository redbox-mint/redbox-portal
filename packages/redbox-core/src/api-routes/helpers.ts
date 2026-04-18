import {
  ZodArray,
  ZodBoolean,
  ZodIntersection,
  ZodNullable,
  ZodNumber,
  ZodObject,
  ZodRawShape,
  ZodOptional,
  ZodTypeAny,
  ZodUnion,
  z,
} from 'zod';
import { isEqual } from 'lodash';
import UrlPattern from 'url-pattern';

import { auth as defaultAuthConfig } from '../config/auth.config';

import {
  ApiFileConstraint,
  ApiRequestDefinition,
  ApiRouteDefinition,
  ApiRouteDefinitionMap,
  ApiRouteMap,
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

function parseRoutePattern(routePattern: string): { method?: HttpMethod; path: string } {
  const trimmed = routePattern.trim();
  if (!trimmed) {
    return { path: trimmed };
  }

  const firstSpaceIndex = trimmed.indexOf(' ');
  if (firstSpaceIndex === -1) {
    return { path: trimmed };
  }

  const method = trimmed.slice(0, firstSpaceIndex).trim();
  const path = trimmed.slice(firstSpaceIndex + 1).trim();
  if (!path.startsWith('/')) {
    return { path: trimmed };
  }

  return { method: normalizeMethod(method), path };
}

export function isApiRoutePath(path: string): boolean {
  return path.split('/').some(segment => segment === 'api');
}

type AuthRuleLike = {
  path: string;
  role: string;
  can_read?: boolean;
  can_update?: boolean;
};

function isAuthRuleLike(rule: unknown): rule is AuthRuleLike {
  return isRecord(rule) && typeof rule.path === 'string' && typeof rule.role === 'string';
}

function getAuthRules(): AuthRuleLike[] {
  const globalWithSails = globalThis as typeof globalThis & {
    sails?: { config?: Record<string, unknown> };
  };
  const runtimeRules = globalWithSails.sails?.config?.auth;
  if (isRecord(runtimeRules) && Array.isArray(runtimeRules.rules)) {
    return runtimeRules.rules.filter(isAuthRuleLike);
  }

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

export function getRedboxRoleExtension(path: string): Record<string, unknown> | undefined {
  const roles: string[] = [];
  const seenRoles = new Set<string>();
  const routePathVariants = getRoutePathVariants(path);

  for (const rule of getAuthRules()) {
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

function getRoutePathSegments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function getRouteSegmentRank(segment: string): number {
  if (!segment.startsWith(':')) {
    return 3;
  }
  if (segment.endsWith('*')) {
    return 0;
  }
  if (segment.endsWith('?')) {
    return 1;
  }
  return 2;
}

function hasSpecificTail(segments: readonly string[], startIndex: number): boolean {
  return segments.slice(startIndex).some(segment => getRouteSegmentRank(segment) >= 2);
}

function compareRouteSpecificity(left: ApiRouteDefinition, right: ApiRouteDefinition): number {
  const leftSegments = getRoutePathSegments(left.path);
  const rightSegments = getRoutePathSegments(right.path);
  const sharedLength = Math.min(leftSegments.length, rightSegments.length);

  for (let index = 0; index < sharedLength; index++) {
    const leftRank = getRouteSegmentRank(leftSegments[index]);
    const rightRank = getRouteSegmentRank(rightSegments[index]);
    if (leftRank !== rightRank) {
      return rightRank - leftRank;
    }
  }

  if (leftSegments.length !== rightSegments.length) {
    const leftHasSpecificTail = hasSpecificTail(leftSegments, sharedLength);
    const rightHasSpecificTail = hasSpecificTail(rightSegments, sharedLength);

    if (leftHasSpecificTail !== rightHasSpecificTail) {
      return leftHasSpecificTail ? -1 : 1;
    }

    if (leftHasSpecificTail) {
      return rightSegments.length - leftSegments.length;
    }

    return leftSegments.length - rightSegments.length;
  }

  const keyComparison = routeKey(left.method, left.path).localeCompare(routeKey(right.method, right.path));
  if (keyComparison !== 0) {
    return keyComparison;
  }

  return `${left.controller}#${left.action}`.localeCompare(`${right.controller}#${right.action}`);
}

function describeRoute(route: ApiRouteDefinition): string {
  return `${String(route.method).toUpperCase()} ${route.path} (${route.controller}#${route.action})`;
}

function describeRouteTarget(target: unknown): string {
  if (typeof target === 'string') {
    return target;
  }

  if (isRecord(target)) {
    const controller = typeof target.controller === 'string' ? target.controller : undefined;
    const action = typeof target.action === 'string' ? target.action : undefined;
    const parts = [controller, action].filter((part): part is string => typeof part === 'string' && part.trim() !== '');
    if (parts.length) {
      return parts.join('#');
    }
  }

  try {
    return JSON.stringify(target);
  } catch {
    return String(target);
  }
}

export function validateApiRouteConsistency(
  contractRoutes: readonly ApiRouteDefinition[],
  runtimeRoutes: Record<string, unknown>,
  context = 'merged runtime route table'
): void {
  const expectedRoutes = buildSailsRouteConfig(contractRoutes);
  const runtimeApiRoutes = new Map<string, unknown>();
  const runtimeApiPathsWithoutMethod = new Set<string>();
  const issues: string[] = [];

  for (const [routePattern, runtimeTarget] of Object.entries(runtimeRoutes)) {
    const parsed = parseRoutePattern(routePattern);
    if (!isApiRoutePath(parsed.path)) {
      continue;
    }

    if (!parsed.method) {
      runtimeApiPathsWithoutMethod.add(parsed.path);
      issues.push(`Legacy API route in ${context} must declare an HTTP method: ${routePattern}`);
      continue;
    }

    const key = routeKey(parsed.method, parsed.path);
    runtimeApiRoutes.set(key, runtimeTarget);

    const expectedTarget = expectedRoutes[key];
    if (expectedTarget === undefined) {
      issues.push(`Unexpected API route in ${context} without a contract definition: ${routePattern}`);
      continue;
    }

    if (!isEqual(expectedTarget, runtimeTarget)) {
      issues.push(
        `API route mismatch in ${context}: ${routePattern} expected ${describeRouteTarget(expectedTarget)} but found ${describeRouteTarget(runtimeTarget)}`
      );
    }
  }

  for (const [routeKeyName, expectedTarget] of Object.entries(expectedRoutes)) {
    if (runtimeApiRoutes.has(routeKeyName)) {
      continue;
    }

    const expectedRoute = contractRoutes.find(route => routeKey(route.method, route.path) === routeKeyName);
    if (expectedRoute && runtimeApiPathsWithoutMethod.has(expectedRoute.path)) {
      continue;
    }

    issues.push(`Contract API route missing from ${context}: ${routeKeyName} (${describeRouteTarget(expectedTarget)})`);
  }

  if (issues.length > 0) {
    throw new Error(`API route consistency check failed for ${context}:\n- ${issues.join('\n- ')}`);
  }
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

export function buildSailsRouteEntry(route: ApiRouteDefinition): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    controller: route.controller,
    action: route.action,
  };
  if (typeof route.csrf === 'boolean') {
    entry.csrf = route.csrf;
  }
  if (route.policy) {
    entry.policy = route.policy;
  }
  if (route.skipAssets !== undefined) {
    entry.skipAssets = route.skipAssets;
  }
  if (route.locals) {
    entry.locals = route.locals;
  }
  if (route.view) {
    entry.view = route.view;
  }
  return entry;
}

export function buildSailsRouteConfig(routes: readonly ApiRouteDefinition[]): ApiRouteMap {
  const sortedRoutes = [...ensureUniqueApiRoutes(routes, 'Sails route config')].sort(compareRouteSpecificity);
  return sortedRoutes.reduce((acc, route) => {
    acc[routeKey(route.method, route.path)] = buildSailsRouteEntry(route);
    return acc;
  }, {} as ApiRouteMap);
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

export function extractFromSource(req: Sails.Req, source: RequestSource, key: string): unknown {
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

export function getRequestFiles(req: Sails.Req): Record<string, unknown[]> {
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

export function routeExtractor(route: ApiRequestDefinition | undefined, req: Sails.Req): unknown {
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

export function isPassthroughObjectSchema(schema: ZodTypeAny): schema is ZodObject<ZodRawShape> {
  return schema instanceof ZodObject && schema._def.unknownKeys === 'passthrough';
}

export function isOptionalSchema(schema: ZodTypeAny): boolean {
  return schema instanceof ZodOptional;
}

function isIntegerSchema(schema: ZodTypeAny): boolean {
  return (
    schema instanceof ZodNumber &&
    Array.isArray((schema as ZodNumber)._def.checks) &&
    (schema as ZodNumber)._def.checks.some((check: { kind?: string }) => check.kind === 'int')
  );
}

function coercePrimitiveValue(value: unknown, schema: ZodTypeAny): unknown {
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

export function coerceValueForSchema(value: unknown, schema: ZodTypeAny): unknown {
  if (value == null) {
    return value;
  }

  if (isOptionalSchema(schema)) {
    return coerceValueForSchema(value, (schema as unknown as { unwrap: () => ZodTypeAny }).unwrap());
  }

  if (schema instanceof ZodNullable) {
    return coerceValueForSchema(value, (schema as unknown as { unwrap: () => ZodTypeAny }).unwrap());
  }

  if (schema instanceof ZodObject) {
    if (!isRecord(value)) {
      return value;
    }
    const shape = schema.shape;
    const result: Record<string, unknown> = {};
    for (const [key, childSchema] of Object.entries(shape)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        result[key] = coerceValueForSchema(value[key], childSchema as unknown as ZodTypeAny);
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
    return value.map(item => coerceValueForSchema(item, schema.element as unknown as ZodTypeAny));
  }

  if (schema instanceof ZodUnion) {
    return value;
  }

  if (schema instanceof ZodIntersection) {
    return value;
  }

  return coercePrimitiveValue(value, schema);
}
