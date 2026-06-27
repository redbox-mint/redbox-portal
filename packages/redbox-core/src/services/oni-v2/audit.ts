import type { IntegrationAuditContext } from '../IntegrationAuditService';
import { IntegrationAuditAction, IntegrationAuditName } from '../../model/storage/IntegrationAuditModel';
import type { OniRunContext } from './types';

export function startOniAudit(
  oid: string,
  action: IntegrationAuditAction,
  runContext: OniRunContext,
  requestSummary: Record<string, unknown>,
  parentAuditContext?: IntegrationAuditContext | null
): IntegrationAuditContext | null {
  if (typeof IntegrationAuditService === 'undefined' || typeof IntegrationAuditService.startAudit !== 'function') {
    return null;
  }
  return IntegrationAuditService.startAudit(oid, action, {
    integrationName: IntegrationAuditName.oni,
    brandId: runContext.brandId,
    triggeredBy: runContext.triggerSource,
    requestSummary,
    traceId: parentAuditContext?.traceId,
    parentSpanId: parentAuditContext?.spanId,
  });
}

export function completeOniAudit(
  ctx: IntegrationAuditContext | null | undefined,
  details: Record<string, unknown>
): void {
  if (typeof IntegrationAuditService !== 'undefined' && typeof IntegrationAuditService.completeAudit === 'function') {
    IntegrationAuditService.completeAudit(ctx, details);
  }
}

export function failOniAudit(
  ctx: IntegrationAuditContext | null | undefined,
  error: unknown,
  details: Record<string, unknown>
): void {
  if (typeof IntegrationAuditService !== 'undefined' && typeof IntegrationAuditService.failAudit === 'function') {
    IntegrationAuditService.failAudit(ctx, error, details);
  }
}
