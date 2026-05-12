import { SearchFilter } from "./storage/RecordTypeModel";
import { NormalizedRecordRelation } from "../config/recordtype.config";

export class RecordTypeResponseModel{

    name:string;
    packageType:string;
    searchFilters:SearchFilter[];
    searchable: boolean;
    relatedTo?: NormalizedRecordRelation[];

    constructor(name:string | undefined,packageType:string | undefined,searchFilters:SearchFilter[], searchable:boolean = true, relatedTo?: NormalizedRecordRelation[]) {
        this.name = name ?? '';
        this.packageType = packageType ?? '';
        this.searchFilters = searchFilters;
        this.searchable = searchable;
        this.relatedTo = relatedTo;
    }
}

export { SearchFilter } from "./storage/RecordTypeModel";
