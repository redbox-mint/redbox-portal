import { IntegrationAuditStatus } from './model/storage/IntegrationAuditModel';

export class IntegrationAuditParams {
  oid: string = '';
  status?: IntegrationAuditStatus;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  page?: number;
  pageSize?: number;
}
