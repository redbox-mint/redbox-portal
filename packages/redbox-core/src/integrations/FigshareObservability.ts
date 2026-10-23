import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import { FigshareRunContext } from '../services/figshare-v2/types';
import { redactObject } from '../utilities/RedactionUtils';
import { type ILogger, logAtLevel } from '@researchdatabox/sails-ng-common';

export { redactObject, redactSecret } from '../utilities/RedactionUtils';

export function withSpan<T>(
  name: string,
  runContext: FigshareRunContext,
  attributes: Attributes,
  fn: () => Promise<T>
): Promise<T> {
  const tracer = trace.getTracer('redbox.figshare-v2');
  return tracer.startActiveSpan(
    name,
    {
      attributes: {
        ...attributes,
        'figshare.record_oid': runContext.recordOid,
        'figshare.brand': runContext.brandName,
        'figshare.correlation_id': runContext.correlationId,
        'figshare.trigger_source': runContext.triggerSource,
      },
    },
    async span => {
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
    }
  );
}

export function logEventWithLogger(
  logger: ILogger,
  level: string,
  message: string,
  runContext: FigshareRunContext,
  payload: unknown = {}
): void {
  logAtLevel(
    logger,
    level,
    {
      recordOid: runContext.recordOid,
      brandName: runContext.brandName,
      correlationId: runContext.correlationId,
      triggerSource: runContext.triggerSource,
      payload: redactObject(payload),
    },
    message
  );
}
