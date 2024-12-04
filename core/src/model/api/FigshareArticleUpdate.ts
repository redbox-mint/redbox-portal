export class FigshareArticleUpdate {
    title: string;
    description: string;
    keywords: string[];
    authors: any[];
    categories: number[];
    custom_fields: any;
    license: number;
    defined_type: string;
    group_id: number;

    constructor(group_id:number,defined_type:string) {
        this.group_id = group_id;
        this.defined_type = defined_type;
    }
}
