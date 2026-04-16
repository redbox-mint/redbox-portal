import { IntegrationAuditStatus } from './model/storage/IntegrationAuditModel';

export class IntegrationAuditParams {
  oid: string = '';
  status?: IntegrationAuditStatus;
  integrationName?: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  page?: number;
  pageSize?: number;
}
