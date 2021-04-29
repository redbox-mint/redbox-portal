export class ListAPIResponse<T> {

    summary: ListAPISummary = new ListAPISummary();
    records: T[];

    constructor() {
        
    }
}

export class ListAPISummary {

    numFound: number = 0;
    page: number = 1;
    start: number = 0;

    constructor() {
        
    }
}
