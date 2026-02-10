export class FigshareArticleUpdate {
    title: string = '';
    description: string = '';
    keywords: string[] = [];
    authors: unknown[] = [];
    categories: number[] = [];
    custom_fields: Record<string, unknown> = {};
    license: number = 0;
    defined_type: string;
    group_id: number;

    constructor(group_id: number, defined_type: string) {
        this.group_id = group_id;
        this.defined_type = defined_type;
    }
}
