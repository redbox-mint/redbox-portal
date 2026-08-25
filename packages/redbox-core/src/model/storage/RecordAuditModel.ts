import type { RecordHookExecutionAuditSummary } from '../../action-execution/audit';
import type { RecordConcurrencyResolution } from '@researchdatabox/sails-ng-common';

export interface RecordMutationAuditConcurrency {
    revision?: number;
    resolution: RecordConcurrencyResolution;
}

export class RecordAuditModel {
    redboxOid: string;
    action:RecordAuditActionType;
    user: Record<string, unknown> | null;
    record: Record<string, unknown>;
    executionSummary?: RecordHookExecutionAuditSummary;
    concurrency?: RecordMutationAuditConcurrency;

    constructor(oid: string, record: Record<string, unknown>, user: Record<string, unknown> | null, action: RecordAuditActionType = RecordAuditActionType.updated, executionSummary?: RecordHookExecutionAuditSummary, concurrency?: RecordMutationAuditConcurrency) {
        if (user!= null && !_.isEmpty(user.password)) {
            delete user.password;
        }
        this.redboxOid = oid;
        this.record = record;
        this.user = user;
        this.action = action;
        this.executionSummary = executionSummary;
        this.concurrency = concurrency;
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
