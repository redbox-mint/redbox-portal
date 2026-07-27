import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import { FigshareRunContext } from './types';
import { redactObject } from '../../utilities/RedactionUtils';
import {isAvailableLogLevel} from "@researchdatabox/sails-ng-common";

export { redactObject, redactSecret } from '../../utilities/RedactionUtils';

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
  const log = sails.log;
  if (!isAvailableLogLevel(level)) {
    log.warn(`Unknown log level '${level}' in logEvent, using 'info' instead.`);
    level = 'info';
  }

  const args = [
    {
      recordOid: runContext.recordOid,
      brandName: runContext.brandName,
      correlationId: runContext.correlationId,
      triggerSource: runContext.triggerSource,
      payload: redactObject(payload)
    },
    message,
  ];

  if (isAvailableLogLevel(level)) {
    if (level in log && typeof log[level] === 'function') {
      log[level](...args);
    }
  }
}
