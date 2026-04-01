export class DashboardTypeResponseModel{

    name:string;
    formatRules:Record<string, unknown>;

    constructor(name:string,formatRules:Record<string, unknown>) {
        this.name = name;
        this.formatRules = formatRules;
    }
}
