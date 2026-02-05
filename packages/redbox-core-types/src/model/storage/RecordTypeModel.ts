
export class RecordTypeModel {
    packageType: string = '';
    searchCore?: string = '';
    hooks?: RecordTypeHooks = new RecordTypeHooks();
    relatedTo: RelatedTo[] = [];
    searchFilters: SearchFilter[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transferResponsibility: any = null; //Legacy to be removed in a future version
    searchable = false as const;
}

export class SearchFilter {
    name: string = '';
    title: string = '';
    type: string = '';
    typeLabel: string = '';
}

export class RelatedTo {
    recordType: string = '';
    foreignField: string = '';
}

export class RecordTypeHooks {
    onCreate: RecordTypeHookOnEvent = new RecordTypeHookOnEvent();
    onUpdate: RecordTypeHookOnEvent = new RecordTypeHookOnEvent();
    onDelete: RecordTypeHookOnEvent = new RecordTypeHookOnEvent();
}

export class RecordTypeHookOnEvent {
    pre: RecordTypeHookDeclaration[] = [];
    post: RecordTypeHookDeclaration[] = [];
    postSync: RecordTypeHookDeclaration[] = [];
}

export class RecordTypeHookDeclaration {
    function: string = '';
    options: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
    } = {};
}
