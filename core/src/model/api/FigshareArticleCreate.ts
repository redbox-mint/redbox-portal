export class FigshareArticleCreate {
    impersonate: number;
    title: string;
    description: string;
    keywords: string[];
    categories: number[];
    custom_fields: any;
    license: number;

    constructor() {
    }
}
