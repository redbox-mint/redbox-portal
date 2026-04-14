export enum IntegrationAuditName {
  figshare = 'figshare',
  doi = 'doi',
}

export enum IntegrationAuditAction {
  syncRecordWithFigshare = 'syncRecordWithFigshare',
  publishAfterUploadFilesJob = 'publishAfterUploadFilesJob',
  publishDoi = 'publishDoi',
  updateDoi = 'updateDoi',
  deleteDoi = 'deleteDoi',
  changeDoiState = 'changeDoiState',
  publishDoiTrigger = 'publishDoiTrigger',
  publishDoiTriggerSync = 'publishDoiTriggerSync',
  updateDoiTriggerSync = 'updateDoiTriggerSync',
}

export enum IntegrationAuditStatus {
  started = 'started',
  success = 'success',
  failed = 'failed',
}

export class IntegrationAuditModel {
  redboxOid: string = '';
  brandId?: string;
  integrationName: IntegrationAuditName = IntegrationAuditName.figshare;
  declare integrationAction: IntegrationAuditAction;
  triggeredBy?: string;
  declare status: IntegrationAuditStatus;
  message?: string;
  errorDetail?: string;
  httpStatusCode?: number;
  declare traceId: string;
  declare spanId: string;
  parentSpanId?: string;
  declare startedAt: string;
  completedAt?: string;
  durationMs?: number;
  requestSummary?: Record<string, unknown>;
  responseSummary?: Record<string, unknown>;

  constructor(init?: Partial<IntegrationAuditModel>) {
    Object.assign(this, init);
    this.validateRequiredFields();
  }

  private validateRequiredFields(): void {
    const missingFields: string[] = [];
    if (this.integrationAction == null) {
      missingFields.push('integrationAction');
    }
    if (this.status == null) {
      missingFields.push('status');
    }
    if (typeof this.traceId !== 'string' || this.traceId.trim() === '') {
      missingFields.push('traceId');
    }
    if (typeof this.spanId !== 'string' || this.spanId.trim() === '') {
      missingFields.push('spanId');
    }
    if (typeof this.startedAt !== 'string' || this.startedAt.trim() === '') {
      missingFields.push('startedAt');
    }
    if (missingFields.length > 0) {
      throw new Error(`IntegrationAuditModel missing required field(s): ${missingFields.join(', ')}`);
    }
  }
}
