import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import { FigshareRunContext } from './types';

const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const API_KEY_PATTERN = /^(sk_live_|sk_test_)[A-Za-z0-9]+$/;

export function redactSecret(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (
    /^Bearer\s+/i.test(trimmed) ||
    JWT_PATTERN.test(trimmed) ||
    API_KEY_PATTERN.test(trimmed)
  ) {
    return 'REDACTED';
  }
  return value;
}

export function redactObject(value: unknown, visited: WeakSet<object> = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return '[Circular]';
    }
    visited.add(value);
    return value.map((entry) => redactObject(entry, visited));
  }
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    if (visited.has(value)) {
      return '[Circular]';
    }
    visited.add(value);
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(obj)) {
      if (key.toLowerCase().includes('token') || key.toLowerCase().includes('authorization') || key.toLowerCase().includes('secret')) {
        result[key] = 'REDACTED';
      } else {
        result[key] = redactObject(entry, visited);
      }
    }
    return result;
  }
  return redactSecret(value);
}

export function withSpan<T>(name: string, runContext: FigshareRunContext, attributes: Attributes, fn: () => Promise<T>): Promise<T> {
  const tracer = trace.getTracer('redbox.figshare-v2');
  return tracer.startActiveSpan(name, {
    attributes: {
      ...attributes,
      'figshare.record_oid': runContext.recordOid,
      'figshare.brand': runContext.brandName,
      'figshare.correlation_id': runContext.correlationId,
      'figshare.trigger_source': runContext.triggerSource
    }
  }, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function logEvent(level: string, message: string, runContext: FigshareRunContext, payload: unknown = {}): void {
  const logger = sails.log[level] || sails.log.info;
  logger({
    recordOid: runContext.recordOid,
    brandName: runContext.brandName,
    correlationId: runContext.correlationId,
    triggerSource: runContext.triggerSource,
    payload: redactObject(payload)
  }, message);
}
