import moment = require("moment");

declare var _:any;
export class RecordAuditModel {
    redboxOid: string;
    user: any;
    record: any;

    constructor(oid, record,user) {
        if (!_.isEmpty(user.password)) {
            delete user.password;
        }
        this.redboxOid = oid;
        this.record = record;
        this.user = user;
    }
}