declare var _:any;
export class RecordAuditModel {
    redboxOid: string;
    action:RecordAuditActionType;
    user: any;
    record: any;

    constructor(oid, record, user, action:RecordAuditActionType = RecordAuditActionType.updated) {
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