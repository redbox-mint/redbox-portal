import { makeOniAuditService } from '../../integrations/oni/audit';
function service() {
  return makeOniAuditService(typeof IntegrationAuditService === 'undefined' ? undefined : IntegrationAuditService);
}
export const startOniAudit: ReturnType<typeof service>['start'] = (...args) => service().start(...args);
export const completeOniAudit: ReturnType<typeof service>['complete'] = (...args) => service().complete(...args);
export const failOniAudit: ReturnType<typeof service>['fail'] = (...args) => service().fail(...args);
