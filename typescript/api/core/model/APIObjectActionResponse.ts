export class APIObjectActionResponse{

    oid:string;
    message:string;
    details:string;

    constructor(oid:string, message:string ='Request processed successfully',details:string = '') {
        this.oid = oid;
        this.message = message;
        this.details = details;
    }
}
