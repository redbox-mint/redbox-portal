import type { IntegrationAuditContext } from '../IntegrationAuditService';
import { IntegrationAuditAction, IntegrationAuditName } from '../../model/storage/IntegrationAuditModel';
import type { FigshareRunContext } from './types';
import { sanitizeFigshareEndpoint, sanitizeFigshareResponse, sanitizeFigshareText } from './diagnostics';

export function startFigshareAudit(
  oid: string,
  action: IntegrationAuditAction,
  runContext: FigshareRunContext,
  requestSummary: Record<string, unknown>,
  parentAuditContext?: IntegrationAuditContext | null
): IntegrationAuditContext | null {
  if (typeof IntegrationAuditService === 'undefined' || typeof IntegrationAuditService.startAudit !== 'function') {
    return null;
  }
  return IntegrationAuditService.startAudit(oid, action, {
    integrationName: IntegrationAuditName.figshare,
    brandId: runContext.brandId,
    triggeredBy: runContext.triggerSource,
    requestSummary,
    traceId: parentAuditContext?.traceId,
    parentSpanId: parentAuditContext?.spanId,
  });
}

export function completeFigshareAudit(ctx: IntegrationAuditContext | null | undefined, details: Record<string, unknown>): void {
  if (typeof IntegrationAuditService !== 'undefined' && typeof IntegrationAuditService.completeAudit === 'function') {
    IntegrationAuditService.completeAudit(ctx, details);
  }
}

export function failFigshareAudit(ctx: IntegrationAuditContext | null | undefined, error: unknown, details: Record<string, unknown>): void {
  if (typeof IntegrationAuditService !== 'undefined' && typeof IntegrationAuditService.failAudit === 'function') {
    const summary = summarizeFigshareError(error);
    IntegrationAuditService.failAudit(ctx, error, {
      ...details,
      message: sanitizeFigshareText(details.message) ?? summary.errorDetail,
      errorDetail: summary.errorDetail,
      httpStatusCode: summary.statusCode ?? details.httpStatusCode,
      responseSummary: {
        ...(details.responseSummary as Record<string, unknown> ?? {}),
        error: summary.responseSummary,
      },
    });
  }
}

/** Follow explicit causes only; never infer an HTTP status from an error message. */
export function summarizeFigshareError(error: unknown): { statusCode?: number; errorDetail: string; responseSummary: Record<string, unknown> } {
  let source = error as { statusCode?: number; responseBody?: unknown; method?: string; endpoint?: string; cause?: unknown; message?: string; name?: string };
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 5 && source != null && typeof source === 'object'; depth++) {
    const validStatus = typeof source.statusCode === 'number' && Number.isInteger(source.statusCode)
      && source.statusCode >= 100 && source.statusCode <= 599;
    const response = sanitizeFigshareResponse(source.responseBody);
    const usefulResponse = typeof response === 'string' || response?.code != null || response?.message != null;
    if (validStatus || usefulResponse || !source.cause || seen.has(source)) break;
    seen.add(source);
    source = source.cause as typeof source;
  }
  const statusCode = typeof source?.statusCode === 'number' && Number.isInteger(source.statusCode) && source.statusCode >= 100 && source.statusCode <= 599 ? source.statusCode : undefined;
  const body = sanitizeFigshareResponse(source?.responseBody);
  const responseSummary: Record<string, unknown> = typeof body === 'object' ? { ...body } : {};
  if (typeof body === 'string') responseSummary.rawResponseBody = body;
  const method = sanitizeFigshareText(source?.method, 10);
  const endpoint = sanitizeFigshareEndpoint(source?.endpoint);
  if (method) responseSummary.method = method;
  if (endpoint) responseSummary.endpoint = endpoint;
  const explanation = typeof body === 'object' ? body.message : body;
  const context = sanitizeFigshareText(source?.message ?? (typeof error === 'string' ? error : undefined)) ?? 'Integration action failed.';
  if (!explanation) {
    responseSummary.errorType = sanitizeFigshareText(source?.name, 100) ?? typeof error;
    responseSummary.message = context;
  }
  return {
    statusCode,
    errorDetail: sanitizeFigshareText([context, explanation].filter(Boolean).join(': ')) ?? 'Integration action failed.',
    responseSummary,
  };
}
