
export class RecordTypeModel {
    packageType:string;
    searchCore:string;
    hooks: RecordTypeHooks;
    relatedTo: RelatedTo[];
    searchFilters: SearchFilter[];
    transferResponsibility: any; //Legacy to be removed in a future version
    searchable:false;
}

export class SearchFilter {
    name: string;
    title: string;
    type: string;
    typeLabel: string;
}

export class RelatedTo {
    recordType: string;
    foreignField: string;
}

export class RecordTypeHooks {
    onCreate: RecordTypeHookOnEvent;
    onUpdate: RecordTypeHookOnEvent;
    onDelete: RecordTypeHookOnEvent;
}

export class RecordTypeHookOnEvent {
    pre: RecordTypeHookDeclaration[];
    post: RecordTypeHookDeclaration[];
    postSync: RecordTypeHookDeclaration[];
}

export class RecordTypeHookDeclaration {
    function: string;
    options: {
        [key: string]: any;
    };
}