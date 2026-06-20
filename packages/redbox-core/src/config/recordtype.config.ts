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
    id?: string;
    label?: string;
    recordType: string;
    localField?: string;
    foreignField: string;
    cardinality?: 'one' | 'many';
    direction?: 'outbound' | 'inbound';
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

export interface NormalizedRecordRelation extends RecordRelation {
    id: string;
    localField: string;
    cardinality: 'one' | 'many';
    direction: 'outbound' | 'inbound';
}

export const DEFAULT_RECORD_RELATION_LOCAL_FIELD = 'redboxOid' as const;
export const DEFAULT_RECORD_RELATION_CARDINALITY = 'many' as const;
export const DEFAULT_RECORD_RELATION_DIRECTION = 'outbound' as const;

function normalizeRelationIdPart(value: string): string {
    const input = String(value ?? '').trim();
    let normalized = '';
    let lastWasUnderscore = false;

    for (const char of input) {
        const isAlphaNumeric =
            (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9');

        if (isAlphaNumeric) {
            normalized += char;
            lastWasUnderscore = false;
            continue;
        }

        if (!lastWasUnderscore) {
            normalized += '_';
            lastWasUnderscore = true;
        }
    }

    let start = 0;
    let end = normalized.length;
    while (start < end && normalized[start] === '_') {
        start += 1;
    }
    while (end > start && normalized[end - 1] === '_') {
        end -= 1;
    }

    const trimmed = normalized.slice(start, end);
    return trimmed || 'relationship';
}

export function buildRecordRelationId(sourceRecordType: string, relation: RecordRelation): string {
    const explicitId = String(relation.id ?? '').trim();
    if (explicitId) {
        return explicitId;
    }

    return [
        normalizeRelationIdPart(sourceRecordType),
        normalizeRelationIdPart(String(relation.recordType ?? '')),
        normalizeRelationIdPart(String(relation.foreignField ?? '')),
    ].join('__');
}

export function normalizeRecordRelation(sourceRecordType: string, relation: RecordRelation): NormalizedRecordRelation {
    const recordType = String(relation.recordType ?? '').trim();
    const foreignField = String(relation.foreignField ?? '').trim();
    if (!recordType) {
        throw new Error(`Record relation for '${sourceRecordType}' is missing 'recordType'.`);
    }
    if (!foreignField) {
        throw new Error(`Record relation '${recordType}' for '${sourceRecordType}' is missing 'foreignField'.`);
    }

    const localField = String(relation.localField ?? DEFAULT_RECORD_RELATION_LOCAL_FIELD).trim() || DEFAULT_RECORD_RELATION_LOCAL_FIELD;
    const cardinality = relation.cardinality === 'one' ? 'one' : DEFAULT_RECORD_RELATION_CARDINALITY;
    const direction = relation.direction === 'inbound' ? 'inbound' : DEFAULT_RECORD_RELATION_DIRECTION;

    return {
        ...relation,
        id: buildRecordRelationId(sourceRecordType, relation),
        recordType,
        localField,
        foreignField,
        cardinality,
        direction,
    };
}

export function normalizeRecordRelations(sourceRecordType: string, relations: unknown): NormalizedRecordRelation[] {
    if (!Array.isArray(relations)) {
        return [];
    }

    return relations.map((relation) => normalizeRecordRelation(sourceRecordType, relation as RecordRelation));
}

export function findNormalizedRecordRelation(sourceRecordType: string, relations: unknown, relationId: string): NormalizedRecordRelation | undefined {
    const normalizedRelationId = String(relationId ?? '').trim();
    if (!normalizedRelationId) {
        return undefined;
    }

    return normalizeRecordRelations(sourceRecordType, relations)
        .find((relation) => relation.id === normalizedRelationId);
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

/**
 * Default record types are no longer shipped in core.
 *
 * The demo record types (rdmp, dataRecord, dataPublication, existing-locations,
 * party) now live in the redbox-hook-dev package and are merged into
 * sails.config.recordtype by the loader when that hook is installed. Core ships
 * pristine so client instances are not forced to remove framework demo entries.
 */
export const recordtype: RecordTypeConfig = {};
