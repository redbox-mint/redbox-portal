import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { metrics, type Attributes } from '@opentelemetry/api';
import { AUTHORIZATION_DECISION_REASON_CODES, AUTHORIZATION_PRINCIPAL_CATEGORIES, ROLLOUT_MODES } from './types';
import {
  AUTHORIZATION_ADMINISTRATION_ERROR_CODES,
  AUTHORIZATION_VALIDATION_ERROR_CODES,
  AUTHORIZATION_PERSISTENCE_VALIDATION_ERROR_CODES,
} from './errors';

export const AUTHORIZATION_ROUTE_FAMILIES = [
  'authorization',
  'records',
  'record-schema',
  'legacy-admin',
  'user',
  'other',
  'internal',
] as const;
export const AUTHORIZATION_METRICS = [
  'decisions',
  'responses',
  'orphan_observations',
  'quorum_rejections',
  'context_queries',
  'context_resolutions',
  'context_query_count',
  'context_duration',
  'context_cache',
  'shadow_collection',
  'collection_transitions',
  'telemetry_rejections',
] as const;
export type AuthorizationMetric = (typeof AUTHORIZATION_METRICS)[number];
const dimensions: Readonly<Record<string, readonly string[]>> = {
  route: AUTHORIZATION_ROUTE_FAMILIES,
  mode: [...ROLLOUT_MODES, 'unknown'],
  category: [...AUTHORIZATION_PRINCIPAL_CATEGORIES, 'unknown'],
  reason: [
    ...AUTHORIZATION_DECISION_REASON_CODES,
    ...AUTHORIZATION_ADMINISTRATION_ERROR_CODES,
    ...AUTHORIZATION_VALIDATION_ERROR_CODES.map(code => `authorization.${code}`),
    ...AUTHORIZATION_PERSISTENCE_VALIDATION_ERROR_CODES.map(code => `authorization.${code}`),
    'authorization.invalid-credential',
    'authorization.scope-denied',
    'authorization.csrf-required',
    'authorization.internal-error',
    'authorization.transaction-unavailable',
    'authorization.resource-denied',
    'other',
  ],
  outcome: ['allow', 'deny', 'success', 'error', 'hit', 'miss', 'failed', 'recovered', 'unknown', 'rejected'],
  status: ['401', '403', '404', '409', '503', '500', '302', '400', '422', 'other'],
  operation: ['user-id', 'user-name', 'assignments', 'roles', 'revisions', 'overrides'],
  source: ['resolution', 'decision', 'system-admin', 'brand-admin', 'collection', 'telemetry'],
};
export type MetricSink = (name: AuthorizationMetric, value: number, labels: Attributes) => void;
const histograms = new Set<AuthorizationMetric>(['context_query_count', 'context_duration']);
let instruments:
  | Map<
      AuthorizationMetric,
      { record?: (value: number, labels: Attributes) => void; add?: (value: number, labels: Attributes) => void }
    >
  | undefined;
function otelSink(name: AuthorizationMetric, value: number, labels: Attributes): void {
  if (!instruments) {
    const meter = metrics.getMeter('redbox.authorization');
    instruments = new Map(
      AUTHORIZATION_METRICS.map(key => [
        key,
        histograms.has(key)
          ? meter.createHistogram(`redbox.authorization.${key}`, {
              unit: key === 'context_duration' ? 'ms' : '{query}',
              advice: {
                explicitBucketBoundaries:
                  key === 'context_duration'
                    ? [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
                    : [0, 1, 2, 3, 4, 5, 8, 16, 32, 64],
              },
            })
          : meter.createCounter(`redbox.authorization.${key}`, { unit: '{event}' }),
      ])
    );
  }
  const instrument = instruments.get(name)!;
  if (instrument.record) instrument.record(value, labels);
  else instrument.add!(value, labels);
}

/** All telemetry boundaries swallow failures, including providers that throw synchronously. */
export function observeAuthorization(work: () => void): void {
  try {
    work();
  } catch {
    authorizationTelemetry.failures += 1;
  }
}

export class AuthorizationTelemetry {
  public failures = 0;
  public rejected = 0;
  public constructor(private readonly sink: MetricSink = otelSink) {}
  public emit(name: AuthorizationMetric, value: number, labels: Readonly<Record<string, unknown>>): void {
    try {
      if (!AUTHORIZATION_METRICS.includes(name) || !Number.isFinite(value) || value < 0)
        throw new Error('invalid metric');
      const safe: Attributes = {};
      let rejected = false;
      for (const [key, value] of Object.entries(labels)) {
        const allowed = dimensions[key];
        if (!allowed) {
          rejected = true;
          continue;
        }
        if (typeof value !== 'string' || !allowed.includes(value)) {
          rejected = true;
          safe[key] = allowed.includes('other') ? 'other' : 'unknown';
        } else safe[key] = value;
      }
      if (rejected) {
        this.rejected += 1;
        this.sink('telemetry_rejections', 1, { source: 'telemetry', outcome: 'rejected' });
      }
      this.sink(name, value, safe);
    } catch {
      this.failures += 1;
    }
  }
}
export const authorizationTelemetry = new AuthorizationTelemetry();

export function authorizationMode(): string {
  try {
    const mode = sails.config.authorization.mode;
    return ROLLOUT_MODES.includes(mode) ? mode : 'unknown';
  } catch {
    return 'unknown';
  }
}
/** Fixed controller families: paths, route IDs, subjects, brands and hook names never become labels. */
export function authorizationLabels(req?: Sails.Req): Record<string, string> {
  const controller = String(req?.options?.controller ?? '')
    .toLowerCase()
    .split('/')
    .pop();
  const route =
    controller === 'authorization'
      ? 'authorization'
      : controller === 'record' || controller === 'records'
        ? 'records'
        : controller === 'recordschema'
          ? 'record-schema'
          : controller === 'admin' || controller === 'role' || controller === 'roles'
            ? 'legacy-admin'
            : controller === 'user'
              ? 'user'
              : req
                ? 'other'
                : 'internal';
  return { route, mode: authorizationMode(), category: req?.authorization?.principal.category ?? 'unknown' };
}
export function observeAuthorizationResponse(req: Sails.Req, status: number, reason: string): void {
  observeAuthorization(() =>
    authorizationTelemetry.emit('responses', 1, {
      ...authorizationLabels(req),
      status: String(status),
      reason,
    })
  );
}

interface ResolutionMeasurement {
  queries: number;
  labels: Record<string, string>;
}
const resolution = new AsyncLocalStorage<ResolutionMeasurement>();
/** Wrap only actual dispatched datastore queries, including fallback queries and rejected attempts. */
export async function contextQuery<T>(operation: string, work: () => PromiseLike<T>): Promise<T> {
  const measurement = resolution.getStore();
  if (measurement) measurement.queries += 1;
  let outcome = 'error';
  try {
    const value = await work();
    outcome = 'success';
    return value;
  } finally {
    observeAuthorization(() =>
      authorizationTelemetry.emit('context_queries', 1, {
        ...(measurement?.labels ?? authorizationLabels()),
        operation,
        outcome,
      })
    );
  }
}
export async function measureAuthorizationContext<T>(
  labels: Record<string, string>,
  work: () => Promise<T>
): Promise<T> {
  const started = performance.now();
  const measurement = { queries: 0, labels };
  let outcome = 'error';
  try {
    return await resolution.run(measurement, async () => {
      const value = await work();
      outcome = 'success';
      return value;
    });
  } finally {
    observeAuthorization(() => {
      const attributes = { ...labels, outcome };
      authorizationTelemetry.emit('context_resolutions', 1, attributes);
      authorizationTelemetry.emit('context_query_count', measurement.queries, attributes);
      authorizationTelemetry.emit('context_duration', performance.now() - started, attributes);
    });
  }
}
export function inAuthorizationContextMeasurement(): boolean {
  return resolution.getStore() !== undefined;
}
