export class APIActionResponse {

    message:string;
    details:string;
    data?: any;

    constructor(message:string ='Request processed successfully',details:string = '') {
        this.message = message;
        this.details = details;
    }
}
