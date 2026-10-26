import * as Context from 'effect/Context';
import * as Layer from 'effect/Layer';
import type { IntegrationAuditContext, Services as IntegrationAuditServices } from '../../queries/IntegrationAudits';
import { IntegrationAuditAction, IntegrationAuditName } from '../../model/storage/IntegrationAuditModel';
import type { OniRunContext } from '../../services/oni-v2/types';

export interface OniAuditService {
  start(
    oid: string,
    action: IntegrationAuditAction,
    runContext: OniRunContext,
    requestSummary: Record<string, unknown>,
    parentAuditContext?: IntegrationAuditContext | null
  ): IntegrationAuditContext | null;
  complete(ctx: IntegrationAuditContext | null | undefined, details: Record<string, unknown>): void | Promise<void>;
  fail(
    ctx: IntegrationAuditContext | null | undefined,
    error: unknown,
    details: Record<string, unknown>
  ): void | Promise<void>;
}

export const OniAuditServiceTag = Context.Service<OniAuditService>('redbox/OniAuditService');

type IntegrationAuditCollaborator = Pick<
  IntegrationAuditServices.IntegrationAuditService,
  'startAudit' | 'completeAudit' | 'failAudit'
>;

export function makeOniAuditService(service: IntegrationAuditCollaborator | undefined): OniAuditService {
  return {
    start(oid, action, runContext, requestSummary, parentAuditContext) {
      if (typeof service?.startAudit !== 'function') return null;
      return service.startAudit(oid, action, {
        integrationName: IntegrationAuditName.oni,
        brandId: runContext.brandId,
        triggeredBy: runContext.triggerSource,
        requestSummary,
        traceId: parentAuditContext?.traceId,
        parentSpanId: parentAuditContext?.spanId,
      });
    },
    complete(ctx, details) {
      return service?.completeAudit?.(ctx, details);
    },
    fail(ctx, error, details) {
      return service?.failAudit?.(ctx, error, details);
    },
  };
}

export function makeOniAuditLayer(service: OniAuditService) {
  return Layer.succeed(OniAuditServiceTag, service);
}
