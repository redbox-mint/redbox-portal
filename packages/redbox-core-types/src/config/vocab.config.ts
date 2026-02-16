/**
 * Vocab Config Interface and Default Values
 * Auto-generated from config/vocab.js
 */

export interface VocabExternalEndpoint {
    method: 'get' | 'post';
    url: string;
    options: Record<string, unknown>;
}

export interface VocabSearchQuery {
    searchCore: string;
    baseQuery: string;
}

export interface VocabDatabaseQuery {
    queryName: string;
}

export interface VocabQueryField {
    property: string;
    type: string;
}

export interface VocabUserQueryField {
    property: string;
    userValueProperty: string;
}

export interface VocabQuery {
    querySource: 'solr' | 'database';
    searchQuery?: VocabSearchQuery;
    databaseQuery?: VocabDatabaseQuery;
    queryField: VocabQueryField;
    userQueryFields?: VocabUserQueryField[];
    resultObjectMapping?: Record<string, string>;
}

export interface VocabCollectionConfig {
    url: string;
    getMethod: string;
    saveMethod: string;
    searchMethod: string;
    processingBuffer: number;
    processingTime: number;
}

export interface VocabConfig {
    clientUri: string;
    collectionUri: string;
    userRootUri: string;
    clientCacheExpiry: number;
    bootStrapVocabs: string[];
    rootUrl: string;
    conceptUri: string;
    cacheExpiry: number;
    external: Record<string, VocabExternalEndpoint>;
    queries: Record<string, VocabQuery>;
    nonAnds: Record<string, { url: string }>;
    collection: Record<string, VocabCollectionConfig>;
}

const baseUrl = "https://geonames.redboxresearchdata.com.au/select";

// Pre-built query strings (avoiding URLSearchParams for Node.js compatibility)
const geonamesDefaultParams = "timeAllowed=1000&rows=7&fq=((feature_class:P AND -population:0) OR feature_class:H OR feature_class:T OR feature_class:A)&defType=edismax&bq=feature_code:COUNTRY^1.5 feature_class:A^2.0 feature_class:P^2.0";
const geonamesCountryParams = "timeAllowed=1000&rows=7&fq=feature_class:A AND feature_code:COUNTRY";

export const vocab: VocabConfig = {
    clientUri: 'vocab',
    collectionUri: 'collection',
    userRootUri: 'user/find',
    clientCacheExpiry: 86400,
    bootStrapVocabs: [],
    rootUrl: 'http://vocabs.ardc.edu.au/repository/api/lda/',
    conceptUri: 'concept.json?_view=all',
    cacheExpiry: 31536000,
    external: {
        geonames: {
            method: "get",
            url: `${baseUrl}?q=basic_name%3A\${query}*&${geonamesDefaultParams}`,
            options: {},
        },
        geonamesCountries: {
            method: "get",
            url: `${baseUrl}?q=basic_name%3A\${query}*&${geonamesCountryParams}`,
            options: {},
        },
    },
    queries: {
        party: {
            querySource: 'database',
            databaseQuery: {
                queryName: 'listParties'
            },
            queryField: {
                property: 'search',
                type: 'text'
            }
        },
        rdmp: {
            querySource: 'database',
            databaseQuery: {
                queryName: 'listRDMPRecords',
            },
            queryField: {
                property: 'title',
                type: 'text'
            }
        }
    },
    nonAnds: {},
    collection: {}
};
