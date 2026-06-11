import type { IntegrationAuditContext } from '../IntegrationAuditService';
import { IntegrationAuditAction, IntegrationAuditName } from '../../model/storage/IntegrationAuditModel';
import type { FigshareRunContext } from './types';

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
    IntegrationAuditService.failAudit(ctx, error, details);
  }
}
