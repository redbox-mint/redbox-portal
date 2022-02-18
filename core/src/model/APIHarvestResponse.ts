export class APIHarvestResponse{
    harvestId:string;
    oid:string;
    message:string;
    details:string;
    status:boolean;

    constructor(harvestId:string, oid:string, status:boolean = true, message:string ='Harvested successfully',details:string = '') {
        this.harvestId = harvestId;
        this.message = message;
        this.details = details;
        this.oid = oid;
        this.status = status;
    }
}
