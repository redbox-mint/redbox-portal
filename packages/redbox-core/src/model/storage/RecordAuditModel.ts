import type { RecordHookExecutionAuditSummary } from '../../action-execution/audit';

export class RecordAuditModel {
    redboxOid: string;
    action:RecordAuditActionType;
    user: Record<string, unknown> | null;
    record: Record<string, unknown>;
    executionSummary?: RecordHookExecutionAuditSummary;

    constructor(oid: string, record: Record<string, unknown>, user: Record<string, unknown> | null, action: RecordAuditActionType = RecordAuditActionType.updated, executionSummary?: RecordHookExecutionAuditSummary) {
        if (user!= null && !_.isEmpty(user.password)) {
            delete user.password;
        }
        this.redboxOid = oid;
        this.record = record;
        this.user = user;
        this.action = action;
        this.executionSummary = executionSummary;
    }
}

export enum RecordAuditActionType {
    created = 'created',
    updated = 'updated',
    validationBypassed = 'validation-bypassed',
    batchValidationBypassed = 'batch-validation-bypassed',
    validationModeChanged = 'validation-mode-changed',
    deleted = 'deleted',
    destroyed = 'destroyed',
    restored = 'restored'
}
