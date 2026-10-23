import type { DoiAudit } from './input';
import type { Services as Audits } from '../../queries/IntegrationAudits';
import type { IntegrationAuditContext } from '../../queries/IntegrationAudits';
import { IntegrationAuditName } from '../../model/storage/IntegrationAuditModel';

type AuditSource = Pick<Audits.IntegrationAuditService, 'startAudit' | 'completeAudit' | 'failAudit'>;
export function doiAudit(input: {
  startAudit(...args: Parameters<AuditSource['startAudit']>): IntegrationAuditContext | null;
  completeAudit(...args: Parameters<AuditSource['completeAudit']>): void | Promise<void>;
  failAudit(...args: Parameters<AuditSource['failAudit']>): void | Promise<void>;
}): DoiAudit {
  return {
    start: (oid, action, context, summary, parent) =>
      input.startAudit(oid, action, {
        integrationName: IntegrationAuditName.doi,
        brandId: context.brandId,
        triggeredBy: context.triggerSource,
        requestSummary: summary,
        traceId: parent?.traceId,
        parentSpanId: parent?.spanId,
      }),
    complete: (...args) => input.completeAudit(...args),
    fail: (...args) => input.failAudit(...args),
  };
}
