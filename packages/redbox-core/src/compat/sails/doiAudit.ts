import { doiAudit } from '../../integrations/doi/audit';
const comparison = doiAudit({
  startAudit: (...args) =>
    typeof IntegrationAuditService !== 'undefined' && typeof IntegrationAuditService.startAudit === 'function'
      ? IntegrationAuditService.startAudit(...args)
      : null,
  completeAudit: (...args) =>
    typeof IntegrationAuditService !== 'undefined' && typeof IntegrationAuditService.completeAudit === 'function'
      ? IntegrationAuditService.completeAudit(...args)
      : undefined,
  failAudit: (...args) =>
    typeof IntegrationAuditService !== 'undefined' && typeof IntegrationAuditService.failAudit === 'function'
      ? IntegrationAuditService.failAudit(...args)
      : undefined,
});
export const startDoiAudit = comparison.start;
export const completeDoiAudit = comparison.complete;
export const failDoiAudit = comparison.fail;
