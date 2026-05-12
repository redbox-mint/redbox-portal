
export class RecordTypeModel {
    packageType: string = '';
    searchCore?: string = '';
    hooks?: RecordTypeHooks = new RecordTypeHooks();
    relatedTo: RelatedTo[] = [];
    searchFilters: SearchFilter[] = [];
    transferResponsibility: unknown = null; //Legacy to be removed in a future version
    searchable = false as const;
}

export class SearchFilter {
    name: string = '';
    title: string = '';
    type: string = '';
    typeLabel: string = '';
}

export class RelatedTo {
    id?: string;
    label?: string;
    recordType: string = '';
    localField?: string;
    foreignField: string = '';
    cardinality?: 'one' | 'many' = 'many';
    direction?: 'outbound' | 'inbound' = 'outbound';
    formHints?: {
        componentNames?: string[];
        sourceField?: string;
        targetField?: string;
        inferWhen?: 'missingConfigOnly' | 'always';
    };
    dashboard?: {
        rowLevel?: number;
        compareField?: string;
    };
    includeByDefault?: boolean;
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
        [key: string]: unknown;
    } = {};
}
