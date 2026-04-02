export class RecordAuditModel {
    redboxOid: string;
    action:RecordAuditActionType;
    user: Record<string, unknown> | null;
    record: Record<string, unknown>;

    constructor(oid: string, record: Record<string, unknown>, user: Record<string, unknown> | null, action: RecordAuditActionType = RecordAuditActionType.updated) {
        if (user!= null && !_.isEmpty(user.password)) {
            delete user.password;
        }
        this.redboxOid = oid;
        this.record = record;
        this.user = user;
        this.action = action;
    }
}

export enum RecordAuditActionType {
    created = 'created',
    updated = 'updated',
    deleted = 'deleted',
    destroyed = 'destroyed',
    restored = 'restored'
}
