/**
 * Named Query Config Interface and Default Values
 *
 * Seed named-query definitions now live as JSON files under
 * `bootstrap-data/namedqueries/` and are loaded into the NamedQuery model by
 * NamedQueryService.bootstrapData(). This config only carries `supportedCollections`,
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
    collectionName: string;
    mongoQuery: Record<string, unknown>;
    localField: string;
    foreignField: string;
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
