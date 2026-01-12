/**
 * Record Type Config Interface
 * (sails.config.recordtype)
 * 
 * Record type definitions with hooks and permissions.
 */

export interface RecordHookOptions {
    [key: string]: unknown;
}

export interface RecordHookDefinition {
    function: string;
    options?: RecordHookOptions;
}

export interface RecordHooksConfig {
    onCreate?: {
        pre?: RecordHookDefinition[];
        post?: RecordHookDefinition[];
        postSync?: RecordHookDefinition[];
    };
    onUpdate?: {
        pre?: RecordHookDefinition[];
        post?: RecordHookDefinition[];
    };
}

export interface RecordRelation {
    recordType: string;
    localField?: string;
    foreignField: string;
}

export interface TransferResponsibilityField {
    label: string;
    updateField?: string;
    updateAlso?: string[];
    fieldNames?: Record<string, string>;
}

export interface TransferResponsibilityConfig {
    fields: Record<string, TransferResponsibilityField>;
    canEdit: Record<string, string[]>;
}

export interface SearchFilterConfig {
    name: string;
    title: string;
    type: 'exact' | 'facet';
    typeLabel: string | null;
    alwaysActive?: boolean;
}

export interface RecordTypeLabels {
    name: string;
    namePlural: string;
}

export interface RecordTypeDefinition {
    packageType: string;
    packageName?: string;
    searchable?: boolean;
    labels?: RecordTypeLabels;
    hooks?: RecordHooksConfig;
    relatedTo?: RecordRelation[];
    transferResponsibility?: TransferResponsibilityConfig;
    searchFilters?: SearchFilterConfig[];
    dashboard?: Record<string, unknown>;
}

export interface RecordTypeConfig {
    [recordTypeName: string]: RecordTypeDefinition;
}

// Note: Default values contain extensive hook configurations.
// The original config/recordtype.js file should be kept.
