/**
 * Named Query Config Interface and Default Values
 *
 * NamedQueryService.bootstrapData() seeds JSON files from `bootstrap-data/namedqueries/`
 * first, then hook/deployment definitions from `namedQuery.queries`. Existing
 * brand/name entries are never overwritten; file seeds take precedence.
 * Both sources require collectionName. This config also carries `supportedCollections`,
 * which the named-query editor surfaces as the Collection field's allowed values.
 */

export interface NamedQueryParam {
    type: 'string' | 'date' | 'number' | 'boolean' | 'array' | 'object';
    path: string;
    queryType?: 'contains' | '<=' | '>=' | string;
    whenUndefined: 'defaultValue' | 'ignore';
    defaultValue?: unknown;
    format?: 'days' | 'ISODate';
    template?: string;
}

export interface RelatedRecordFilterDefinition {
    rootRecordType?: string;
    relationId?: string;
    collectionName?: string;
    mongoQuery: Record<string, unknown>;
    localField?: string;
    foreignField?: string;
}

export interface NamedQueryDefinition {
    name?: string;
    collectionName: string;
    brandIdFieldPath?: string;
    resultObjectMapping: Record<string, string>;
    mongoQuery: Record<string, unknown>;
    sort?: Array<Record<string, 'ASC' | 'DESC'>>;
    expandRelations?: boolean;
    relatedRecordFilters?: RelatedRecordFilterDefinition[];
    queryParams: Record<string, NamedQueryParam>;
}

export interface NamedQueryDefinitions {
    [queryName: string]: NamedQueryDefinition;
}

export interface NamedQueryConfig {
    /**
     * Collections that may be selected when defining a named query. Surfaced to the
     * named-query editor so the Collection field can be a strict dropdown of valid,
     * brand-scoped values.
     */
    supportedCollections: string[];
    queries?: NamedQueryDefinitions;
}

export const namedQuery: NamedQueryConfig = {
    supportedCollections: ['record', 'user']
};
