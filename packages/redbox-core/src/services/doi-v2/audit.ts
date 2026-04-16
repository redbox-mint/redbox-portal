import type { IntegrationAuditContext } from '../IntegrationAuditService';
import { IntegrationAuditAction, IntegrationAuditName } from '../../model/storage/IntegrationAuditModel';
import type { DoiRunContext } from './types';

declare const IntegrationAuditService: {
  startAudit: (
    oid: string,
    action: IntegrationAuditAction,
    opts?: Record<string, unknown> & { integrationName?: IntegrationAuditName }
  ) => IntegrationAuditContext;
  completeAudit: (ctx: IntegrationAuditContext | null | undefined, result?: Record<string, unknown>) => void;
  failAudit: (ctx: IntegrationAuditContext | null | undefined, error: unknown, details?: Record<string, unknown>) => void;
};

export function startDoiAudit(
  oid: string,
  action: IntegrationAuditAction,
  runContext: DoiRunContext,
  requestSummary: Record<string, unknown>,
  parentAuditContext?: Pick<IntegrationAuditContext, 'traceId' | 'spanId'>
): IntegrationAuditContext | null {
  if (typeof IntegrationAuditService?.startAudit !== 'function') {
    return null;
  }
  return IntegrationAuditService.startAudit(oid, action, {
    integrationName: IntegrationAuditName.doi,
    brandId: runContext.brandName,
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
