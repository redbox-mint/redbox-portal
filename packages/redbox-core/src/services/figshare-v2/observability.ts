import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import _ from 'lodash';
import { FigshareRunContext } from './types';

export function redactSecret(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  if (value.toLowerCase().includes('token') || value.toLowerCase().includes('authorization')) {
    return 'REDACTED';
  }
  return value;
}

export function redactObject(value: unknown): unknown {
  if (_.isArray(value)) {
    return value.map((entry) => redactObject(entry));
  }
  if (_.isPlainObject(value)) {
    return _.mapValues(value as Record<string, unknown>, (entry, key) => {
      if (key.toLowerCase().includes('token') || key.toLowerCase().includes('authorization') || key.toLowerCase().includes('secret')) {
        return 'REDACTED';
      }
      return redactObject(entry);
    });
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
