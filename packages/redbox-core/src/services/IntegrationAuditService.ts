import { LegacyIntegrationAuditService } from '../compat/sails/integrationAudits';
export * from '../queries/IntegrationAudits';
export namespace Services {
  export class IntegrationAuditService extends LegacyIntegrationAuditService {}
}
declare global {
  let IntegrationAuditService: Services.IntegrationAuditService;
}
