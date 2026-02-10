import { SearchFilter } from "./storage/RecordTypeModel";

export class RecordTypeResponseModel{

    name:string;
    packageType:string;
    searchFilters:SearchFilter[];
    searchable: boolean;

    constructor(name:string | undefined,packageType:string | undefined,searchFilters:SearchFilter[], searchable:boolean = true) {
        this.name = name ?? '';
        this.packageType = packageType ?? '';
        this.searchFilters = searchFilters;
        this.searchable = searchable;
    }
}

export { SearchFilter } from "./storage/RecordTypeModel";
