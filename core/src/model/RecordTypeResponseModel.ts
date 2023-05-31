export class RecordTypeResponseModel{

    name:string;
    packageType:string;
    searchFilters:SearchFilter;

    constructor(name:string,packageType:string,searchFilters:any) {
        this.name = name;
        this.packageType = packageType;
        this.searchFilters = searchFilters;
    }
}

export class SearchFilter {
    name:string;
    title:string;
    type: SearchFilterType;
    typeLabel: string;

}

export enum SearchFilterType {
    exact = 'exact',
    facet = 'facet'
}
