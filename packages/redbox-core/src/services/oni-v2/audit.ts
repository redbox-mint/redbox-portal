import { Context, Layer } from 'effect';
import type { IntegrationAuditContext, Services as IntegrationAuditServices } from '../IntegrationAuditService';
import { IntegrationAuditAction, IntegrationAuditName } from '../../model/storage/IntegrationAuditModel';
import type { OniRunContext } from './types';

export interface OniAuditService {
  start(
    oid: string,
    action: IntegrationAuditAction,
    runContext: OniRunContext,
    requestSummary: Record<string, unknown>,
    parentAuditContext?: IntegrationAuditContext | null
  ): IntegrationAuditContext | null;
  complete(ctx: IntegrationAuditContext | null | undefined, details: Record<string, unknown>): void;
  fail(ctx: IntegrationAuditContext | null | undefined, error: unknown, details: Record<string, unknown>): void;
}

export const OniAuditServiceTag = Context.GenericTag<OniAuditService>('redbox/OniAuditService');

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
      service?.completeAudit?.(ctx, details);
    },
    fail(ctx, error, details) {
      service?.failAudit?.(ctx, error, details);
    },
  };
}

export function makeOniAuditLayer(service: OniAuditService) {
  return Layer.succeed(OniAuditServiceTag, service);
}

/** @deprecated Prefer OniAuditServiceTag inside Effect programs. */
export function startOniAudit(
  oid: string,
  action: IntegrationAuditAction,
  runContext: OniRunContext,
  requestSummary: Record<string, unknown>,
  parentAuditContext?: IntegrationAuditContext | null
): IntegrationAuditContext | null {
  const service = typeof IntegrationAuditService === 'undefined' ? undefined : IntegrationAuditService;
  return makeOniAuditService(service).start(oid, action, runContext, requestSummary, parentAuditContext);
}

export function completeOniAudit(
  ctx: IntegrationAuditContext | null | undefined,
  details: Record<string, unknown>
): void {
  const service = typeof IntegrationAuditService === 'undefined' ? undefined : IntegrationAuditService;
  makeOniAuditService(service).complete(ctx, details);
}

export function failOniAudit(
  ctx: IntegrationAuditContext | null | undefined,
  error: unknown,
  details: Record<string, unknown>
): void {
  const service = typeof IntegrationAuditService === 'undefined' ? undefined : IntegrationAuditService;
  makeOniAuditService(service).fail(ctx, error, details);
}
