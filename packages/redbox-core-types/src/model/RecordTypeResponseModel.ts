export class RecordTypeResponseModel{

    name:string;
    packageType:string;
    searchFilters:SearchFilter;
    searchable: boolean;

    constructor(name:string | undefined,packageType:string | undefined,searchFilters:any, searchable:boolean = true) {
        this.name = name ?? '';
        this.packageType = packageType ?? '';
        this.searchFilters = searchFilters;
        this.searchable = searchable;
    }
}

export class SearchFilter {
    name: string = '';
    title: string = '';
    type: SearchFilterType = SearchFilterType.exact;
    typeLabel: string = '';
}

export enum SearchFilterType {
    exact = 'exact',
    facet = 'facet'
}
