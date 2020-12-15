export class APIErrorResponse{

    message:string;
    details:string;

    constructor(message:string ='An error has occurred',details:string = '') {
        this.message = message;
        this.details = details;
    }
}
