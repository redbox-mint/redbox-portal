declare var _:any;
export class RecordAuditModel {
    redboxOid: string;
    action:string;
    user: any;
    record: any;

    constructor(oid, record, user, action:string = 'update') {
        if (user!= null && !_.isEmpty(user.password)) {
            delete user.password;
        }
        this.redboxOid = oid;
        this.record = record;
        this.user = user;
        this.action = action;
    }
}