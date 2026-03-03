export class FigshareArticleEmbargo {
    impersonate: number;
    is_embargoed: boolean;
    embargo_date: string;
    embargo_type: string;
    embargo_title: string;
    embargo_reason: string;
    embargo_options: unknown[]; 

    constructor(impersonate: number,is_embargoed:boolean,embargo_date:string,embargo_type:string,embargo_title:string,embargo_reason:string,embargo_options:unknown[]) {
        this.impersonate = impersonate;
        this.is_embargoed = is_embargoed;
        this.embargo_date = embargo_date;
        this.embargo_type = embargo_type;
        this.embargo_title = embargo_title;
        this.embargo_reason = embargo_reason;
        this.embargo_options = embargo_options;
    }
}
