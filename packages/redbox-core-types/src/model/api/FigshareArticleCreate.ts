export class FigshareArticleCreate {
    impersonate: number = 0;
    title: string = '';
    description: string = '';
    keywords: string[] = [];
    categories: number[] = [];
    custom_fields: Record<string, unknown> = {};
    license: number = 0;

    constructor() {
    }
}
