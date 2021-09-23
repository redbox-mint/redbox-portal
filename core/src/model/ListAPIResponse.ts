import { ListAPISummary } from "./ListAPISummary";


export class ListAPIResponse<T> {

    summary: ListAPISummary = new ListAPISummary();
    records: T[];

    constructor() {
        
    }
}

