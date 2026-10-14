export type SiemAdapterType = 'splunk-hec-json' | 'otel-otlp-logs' | 'syslog-rfc5424-json' | 'cef' | 'leef';

export type SiemEventCategory =
  | 'authentication'
  | 'authorization'
  | 'userManagement'
  | 'recordLifecycle'
  | 'integrationAudit'
  | 'attachmentAccess';

export type SiemSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface SiemRetryConfig {
  retryDelayMs?: number;
  retryBackoffMultiplier?: number;
  maxAttempts?: number;
}

export interface SiemDestinationConfig {
  id: string;
  name: string;
  enabled: boolean;
  adapterType: SiemAdapterType;
  endpointUrl: string;
  token?: string;
  username?: string;
  password?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retry?: SiemRetryConfig;
}

export interface SiemEventSelectionConfig {
  categories: Record<SiemEventCategory, boolean>;
  severity: Record<string, SiemSeverity>;
}

export interface SiemRedactionConfig {
  denylistedPaths: string[];
  maxPayloadBytes: number;
  includeActorEmail: boolean;
  includeIpAddress: boolean;
  includeUserAgent: boolean;
}

export interface SiemDeliveryConfig {
  batchSize: number;
  maxAttempts: number;
  deadLetterRetentionDays: number;
  retryDelayMs: number;
  retryBackoffMultiplier: number;
  nonBlocking: true;
}

export const DEFAULT_SIEM_EVENT_SELECTION: SiemEventSelectionConfig = {
  categories: {
    authentication: true,
    authorization: true,
    userManagement: true,
    recordLifecycle: true,
    integrationAudit: true,
    attachmentAccess: true,
  },
  severity: {
    'authentication.login.failure': 'warning',
    'authorization.failure': 'warning',
    'integration.failure': 'error',
  },
};

export const DEFAULT_SIEM_REDACTION: SiemRedactionConfig = {
  denylistedPaths: [
    'password',
    'token',
    'secret',
    'authorization',
    'headers.Authorization',
    'connection.token',
    'connection.password',
  ],
  maxPayloadBytes: 64 * 1024,
  includeActorEmail: false,
  includeIpAddress: false,
  includeUserAgent: false,
};

export const DEFAULT_SIEM_DELIVERY: SiemDeliveryConfig = {
  batchSize: 50,
  maxAttempts: 3,
  deadLetterRetentionDays: 30,
  retryDelayMs: 60000,
  retryBackoffMultiplier: 2,
  nonBlocking: true,
};

export interface SiemConfigDto {
  enabled: boolean;
  destinations: SiemDestinationConfig[];
  events: SiemEventSelectionConfig;
  redaction: SiemRedactionConfig;
  delivery: SiemDeliveryConfig;
}

export const SIEM_ADAPTER_TYPES = ['splunk-hec-json', 'otel-otlp-logs', 'syslog-rfc5424-json', 'cef', 'leef'] as const;
export const SIEM_CATEGORIES = [
  'authentication',
  'authorization',
  'userManagement',
  'recordLifecycle',
  'integrationAudit',
  'attachmentAccess',
] as const;
export const SIEM_SEVERITIES = ['info', 'warning', 'error', 'critical'] as const;
export class SiemConfigurationError extends Error {}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new SiemConfigurationError(`${path} must be an object.`);
  return Object.fromEntries(Object.entries(value));
}
function boolean(value: unknown, fallback: boolean, path: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new SiemConfigurationError(`${path} must be boolean.`);
  return value;
}
function number(value: unknown, fallback: number, min: number, max: number, path: string, integer = true): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new SiemConfigurationError(`${path} must be between ${min} and ${max}${integer ? ' (integer)' : ''}.`);
  return value;
}
function string(value: unknown, path: string, required = false): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || (required && !value.trim()))
    throw new SiemConfigurationError(`${path} must be ${required ? 'a nonempty' : 'a'} string.`);
  return value;
}
function adapter(value: unknown): SiemAdapterType {
  for (const item of SIEM_ADAPTER_TYPES) if (value === item) return item;
  throw new SiemConfigurationError('Unsupported adapterType.');
}
function severity(value: unknown): SiemSeverity {
  for (const item of SIEM_SEVERITIES) if (value === item) return item;
  throw new SiemConfigurationError('Unsupported severity.');
}
export function normalizeSiemRedaction(input: unknown = {}): SiemRedactionConfig {
  const r = record(input, 'redaction');
  const paths = r.denylistedPaths ?? DEFAULT_SIEM_REDACTION.denylistedPaths;
  if (r.denylistedPaths === null || !Array.isArray(paths) || paths.some(p => typeof p !== 'string' || !p.trim()))
    throw new SiemConfigurationError('denylistedPaths must contain nonempty strings.');
  return {
    denylistedPaths: paths.map(p => String(p)),
    // Reserve room for the canonical event envelope even after all content is truncated.
    maxPayloadBytes: number(
      r.maxPayloadBytes,
      DEFAULT_SIEM_REDACTION.maxPayloadBytes,
      1024,
      10485760,
      'maxPayloadBytes'
    ),
    includeActorEmail: boolean(r.includeActorEmail, DEFAULT_SIEM_REDACTION.includeActorEmail, 'includeActorEmail'),
    includeIpAddress: boolean(r.includeIpAddress, DEFAULT_SIEM_REDACTION.includeIpAddress, 'includeIpAddress'),
    includeUserAgent: boolean(r.includeUserAgent, DEFAULT_SIEM_REDACTION.includeUserAgent, 'includeUserAgent'),
  };
}
export function normalizeSiemDestination(input: unknown): SiemDestinationConfig {
  const d = record(input, 'destination');
  const id = string(d.id, 'destination.id', true);
  const endpointUrl = string(d.endpointUrl, 'endpointUrl', true);
  if (id === undefined || endpointUrl === undefined)
    throw new SiemConfigurationError('Destination id and endpoint required.');
  let url: URL;
  try {
    url = new URL(endpointUrl);
  } catch {
    throw new SiemConfigurationError('Invalid HTTP(S) endpointUrl.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new SiemConfigurationError('Endpoint must use HTTP(S) without embedded credentials.');
  const result: SiemDestinationConfig = {
    id,
    name: string(d.name, 'name') ?? id,
    enabled: boolean(d.enabled, true, 'destination.enabled'),
    adapterType: adapter(d.adapterType),
    endpointUrl,
    token: string(d.token, 'token'),
    username: string(d.username, 'username'),
    password: string(d.password, 'password'),
    timeoutMs: number(d.timeoutMs, 10000, 100, 300000, 'timeoutMs'),
  };
  if (d.headers !== undefined) {
    const headers = record(d.headers, 'headers');
    result.headers = {};
    const names = new Set<string>();
    for (const [key, value] of Object.entries(headers)) {
      // Generic secret-path helpers cannot safely traverse these property names.
      if (['constructor', 'prototype', '__proto__'].includes(key.toLowerCase()))
        throw new SiemConfigurationError('Reserved header name.');
      if (
        !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) ||
        names.has(key.toLowerCase()) ||
        typeof value !== 'string' ||
        /[\r\n]/.test(value)
      )
        throw new SiemConfigurationError('Invalid or duplicate header.');
      names.add(key.toLowerCase());
      result.headers[key] = value;
    }
  }
  if (d.retry !== undefined) {
    const r = record(d.retry, 'retry');
    result.retry = {};
    if (r.maxAttempts !== undefined)
      result.retry.maxAttempts = number(r.maxAttempts, DEFAULT_SIEM_DELIVERY.maxAttempts, 1, 100, 'retry.maxAttempts');
    if (r.retryDelayMs !== undefined)
      result.retry.retryDelayMs = number(
        r.retryDelayMs,
        DEFAULT_SIEM_DELIVERY.retryDelayMs,
        1,
        86400000,
        'retryDelayMs'
      );
    if (r.retryBackoffMultiplier !== undefined)
      result.retry.retryBackoffMultiplier = number(
        r.retryBackoffMultiplier,
        DEFAULT_SIEM_DELIVERY.retryBackoffMultiplier,
        1,
        10,
        'retryBackoffMultiplier',
        false
      );
  }
  return result;
}
export function normalizeSiemConfiguration(input: unknown = {}): SiemConfigDto {
  const c = record(input, 'siem');
  const e = record(c.events === undefined ? {} : c.events, 'events');
  const categories = record(e.categories === undefined ? {} : e.categories, 'categories');
  const mappedSeverity = record(e.severity === undefined ? {} : e.severity, 'severity');
  const events = structuredClone(DEFAULT_SIEM_EVENT_SELECTION);
  for (const key of Object.keys(categories))
    if (!SIEM_CATEGORIES.some(c => c === key)) throw new SiemConfigurationError('Unsupported event category.');
  for (const key of SIEM_CATEGORIES) events.categories[key] = boolean(categories[key], events.categories[key], key);
  for (const [key, value] of Object.entries(mappedSeverity)) {
    if (!key.trim()) throw new SiemConfigurationError('Severity event name required.');
    events.severity[key] = severity(value);
  }
  const d = record(c.delivery === undefined ? {} : c.delivery, 'delivery');
  boolean(d.nonBlocking, true, 'nonBlocking'); // Legacy false is normalized: delivery is always asynchronous.
  if (c.destinations !== undefined && !Array.isArray(c.destinations))
    throw new SiemConfigurationError('destinations must be an array.');
  const destinations = (Array.isArray(c.destinations) ? c.destinations : []).map(normalizeSiemDestination);
  if (new Set(destinations.map(d => d.id)).size !== destinations.length)
    throw new SiemConfigurationError('Destination ids must be unique.');
  return {
    enabled: boolean(c.enabled, false, 'enabled'),
    destinations,
    events,
    redaction: normalizeSiemRedaction(c.redaction === undefined ? {} : c.redaction),
    delivery: {
      batchSize: number(d.batchSize, DEFAULT_SIEM_DELIVERY.batchSize, 1, 500, 'batchSize'),
      maxAttempts: number(d.maxAttempts, DEFAULT_SIEM_DELIVERY.maxAttempts, 1, 100, 'maxAttempts'),
      retryDelayMs: number(d.retryDelayMs, DEFAULT_SIEM_DELIVERY.retryDelayMs, 1, 86400000, 'retryDelayMs'),
      retryBackoffMultiplier: number(
        d.retryBackoffMultiplier,
        DEFAULT_SIEM_DELIVERY.retryBackoffMultiplier,
        1,
        10,
        'retryBackoffMultiplier',
        false
      ),
      deadLetterRetentionDays: number(
        d.deadLetterRetentionDays,
        DEFAULT_SIEM_DELIVERY.deadLetterRetentionDays,
        1,
        3650,
        'deadLetterRetentionDays'
      ),
      nonBlocking: true,
    },
  };
}

/** Only explicitly harmless headers are public; arbitrary extension headers may contain credentials. */
export function isSiemSecretHeader(name: string): boolean {
  return !['accept', 'content-type', 'user-agent', 'x-test'].includes(name.toLowerCase());
}

export interface SiemListResponse<T> {
  rows: T[];
  total: number;
}

export interface SecurityEventRow {
  id?: string;
  eventId?: string;
  brandId?: string;
  portalId?: string;
  eventType?: string;
  category?: string;
  severity?: string;
  occurredAt?: string;
  source?: string;
  deliveryState?: string;
  correlationId?: string;
  traceId?: string;
}

export interface SiemDeliveryAttemptRow {
  id?: string;
  eventId?: string;
  brandId?: string;
  destinationId?: string;
  adapterType?: string;
  attemptNumber?: number;
  status?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  httpStatusCode?: number;
  responseSummary?: Record<string, unknown>;
  errorSummary?: Record<string, unknown>;
}

export interface SiemTestResult {
  status: 'success' | 'failed';
  httpStatusCode?: number;
  durationMs?: number;
  responseSummary?: Record<string, unknown>;
  errorSummary?: Record<string, unknown>;
}

export interface SiemEventsQuery {
  brandId?: string;
  eventType?: string;
  category?: string;
  deliveryState?: string;
  limit?: number;
  offset?: number;
}

export interface SiemDeliveryStatusQuery {
  brandId?: string;
  destinationId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface SiemTestInput {
  destination: SiemDestinationConfig;
  redaction?: Partial<SiemRedactionConfig>;
}
