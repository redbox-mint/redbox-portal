export class APIActionResponse {

    message:string;
    details:string;

    constructor(message:string ='Request processed successfully',details:string = '') {
        this.message = message;
        this.details = details;
    }
}
