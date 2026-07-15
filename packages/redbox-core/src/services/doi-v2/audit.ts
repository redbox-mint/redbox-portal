import type { IntegrationAuditContext } from '../IntegrationAuditService';
import { IntegrationAuditAction, IntegrationAuditName } from '../../model/storage/IntegrationAuditModel';
import type { DoiRunContext } from './types';

export function startDoiAudit(
  oid: string,
  action: IntegrationAuditAction,
  runContext: DoiRunContext,
  requestSummary: Record<string, unknown>,
  parentAuditContext?: IntegrationAuditContext | null
): IntegrationAuditContext | null {
  if (typeof IntegrationAuditService?.startAudit !== 'function') {
    return null;
  }
  return IntegrationAuditService.startAudit(oid, action, {
    integrationName: IntegrationAuditName.doi,
    brandId: runContext.brandId,
    triggeredBy: runContext.triggerSource,
    requestSummary,
    traceId: parentAuditContext?.traceId,
    parentSpanId: parentAuditContext?.spanId,
  });
}

export function completeDoiAudit(ctx: IntegrationAuditContext | null | undefined, details: Record<string, unknown>): void {
  if (typeof IntegrationAuditService?.completeAudit === 'function') {
    IntegrationAuditService.completeAudit(ctx, details);
  }
}

export function failDoiAudit(ctx: IntegrationAuditContext | null | undefined, error: unknown, details: Record<string, unknown>): void {
  if (typeof IntegrationAuditService?.failAudit === 'function') {
    IntegrationAuditService.failAudit(ctx, error, details);
  }
}
