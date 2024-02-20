export class DashboardTypeResponseModel{

    name:string;
    formatRules:any;

    constructor(name:string,formatRules:any) {
        this.name = name;
        this.formatRules = formatRules;
    }
}
