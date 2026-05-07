export class RecordAuditParams {
    oid: string = '';
    dateFrom: Date | null = null;
    dateTo: Date | null = null;
    action?: string;
    workflowState?: string;
}
