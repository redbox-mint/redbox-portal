import type { IntegrationAuditContext, Services as Audits } from '../../queries/IntegrationAudits';
import { IntegrationAuditAction, IntegrationAuditName } from '../../model/storage/IntegrationAuditModel';
import type { FigshareRunContext } from '../../services/figshare-v2/types';

export function createFigshareAudit(
  service: Pick<Audits.IntegrationAuditService, 'startAudit' | 'completeAudit' | 'failAudit'> | undefined
) {
  function startFigshareAudit(
    oid: string,
    action: IntegrationAuditAction,
    context: FigshareRunContext,
    requestSummary: Record<string, unknown>,
    parent?: IntegrationAuditContext | null
  ): IntegrationAuditContext | null {
    if (typeof service?.startAudit !== 'function') return null;
    const audit: IntegrationAuditContext = {
      ...service.startAudit(oid, action, {
        integrationName: IntegrationAuditName.figshare,
        brandId: context.brandId,
        triggeredBy: context.triggerSource,
        requestSummary,
        traceId: parent?.traceId,
        parentSpanId: parent?.spanId,
      }),
    };
    // Checkpoint plain JSON; these optional producer fields cannot be undefined.
    for (const key of ['brandId', 'triggeredBy', 'parentSpanId', 'requestSummary'] as const)
      if (audit[key] === undefined) delete audit[key];
    return audit;
  }
  const completeFigshareAudit = (
    context: IntegrationAuditContext | null | undefined,
    details: Record<string, unknown>
  ) => service?.completeAudit?.(context, details);
  const failFigshareAudit = (
    context: IntegrationAuditContext | null | undefined,
    error: unknown,
    details: Record<string, unknown>
  ) => service?.failAudit?.(context, error, details);
  return { startFigshareAudit, completeFigshareAudit, failFigshareAudit };
}
