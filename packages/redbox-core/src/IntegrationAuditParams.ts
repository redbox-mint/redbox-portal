import { IntegrationAuditStatus } from './model/storage/IntegrationAuditModel';

export class IntegrationAuditParams {
  oid: string = '';
  brandId?: string;
  destinationId?: string;
  status?: IntegrationAuditStatus;
  integrationName?: string;
  /** Live destination status replaces these historical provider summaries. @internal */
  excludedIntegrationNames?: string[];
  excludeDestinationAudits?: boolean;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  page?: number;
  pageSize?: number;
}
