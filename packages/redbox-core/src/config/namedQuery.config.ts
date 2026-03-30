/**
 * Named Query Config Interface and Default Values
 * Auto-generated from config/namedQuery.js
 */

export interface NamedQueryParam {
    type: 'string' | 'date';
    path: string;
    queryType?: 'contains' | '<=' | '>=' | string;
    whenUndefined: 'defaultValue' | 'ignore';
    defaultValue?: string;
    format?: 'days' | 'ISODate';
    template?: string;
}

export interface NamedQueryDefinition {
    collectionName: string;
    brandIdFieldPath?: string;
    resultObjectMapping: Record<string, string>;
    mongoQuery: Record<string, unknown>;
    sort?: Array<Record<string, 'ASC' | 'DESC'>>;
    queryParams: Record<string, NamedQueryParam>;
}

export interface NamedQueryConfig {
    [queryName: string]: NamedQueryDefinition;
}

export const namedQuery: NamedQueryConfig = {
    'listRDMPRecords': {
        collectionName: 'record',
        brandIdFieldPath: 'metaMetadata.brandId',
        resultObjectMapping: {
            oid: '<%= record.redboxOid%>',
            title: '<%= record.metadata.title %>',
            contributor_ci: '<%= record.metadata.contributor_ci.text_full_name %>',
            contributor_data_manager: '<%= record.metadata.contributor_data_manager.text_full_name %>'
        },
        mongoQuery: {
            'metaMetadata.type': 'rdmp',
            'metadata.title': null,
            'dateCreated': null
        },
        sort: [{ 'lastSaveDate': 'DESC' }],
        queryParams: {
            'title': {
                type: 'string',
                path: 'metadata.title',
                queryType: 'contains',
                whenUndefined: 'defaultValue',
                defaultValue: ''
            },
            'dateCreatedBefore': {
                type: 'string',
                path: 'dateCreated',
                queryType: '<=',
                whenUndefined: 'defaultValue',
                defaultValue: '3000-01-01T00:00:00.000Z'
            },
            'dateCreatedAfter': {
                type: 'string',
                path: 'dateCreated',
                queryType: '>=',
                whenUndefined: 'defaultValue',
                defaultValue: '1900-01-01T00:00:00.000Z'
            },
            'dateModifiedBefore': {
                type: 'string',
                path: 'lastSaveDate',
                queryType: '<=',
                whenUndefined: 'defaultValue',
                defaultValue: '3000-01-01T00:00:00.000Z'
            },
            'dateModifiedAfter': {
                type: 'string',
                path: 'lastSaveDate',
                queryType: '>=',
                whenUndefined: 'defaultValue',
                defaultValue: '1900-01-01T00:00:00.000Z'
            }
        }
    },
    'listDRRecords': {
        collectionName: 'record',
        brandIdFieldPath: 'metaMetadata.brandId',
        resultObjectMapping: {},
        mongoQuery: {
            'metaMetadata.type': 'dataRecord',
            'metadata.title': null,
            'dateCreated': null
        },
        queryParams: {
            'title': {
                type: 'string',
                path: 'metadata.title',
                queryType: 'contains',
                whenUndefined: 'defaultValue',
                defaultValue: ''
            },
            'dateCreatedBefore': {
                type: 'string',
                path: 'dateCreated',
                queryType: '<=',
                whenUndefined: 'defaultValue',
                defaultValue: '3000-01-01T00:00:00.000Z'
            },
            'dateCreatedAfter': {
                type: 'string',
                path: 'dateCreated',
                queryType: '>=',
                whenUndefined: 'defaultValue',
                defaultValue: '1900-01-01T00:00:00.000Z'
            },
            'dateModifiedBefore': {
                type: 'string',
                path: 'lastSaveDate',
                queryType: '<=',
                whenUndefined: 'defaultValue',
                defaultValue: '3000-01-01T00:00:00.000Z'
            },
            'dateModifiedAfter': {
                type: 'string',
                path: 'lastSaveDate',
                queryType: '>=',
                whenUndefined: 'defaultValue',
                defaultValue: '1900-01-01T00:00:00.000Z'
            }
        }
    },
    'listDPRecords': {
        collectionName: 'record',
        brandIdFieldPath: 'metaMetadata.brandId',
        resultObjectMapping: {},
        mongoQuery: {
            'metaMetadata.type': 'dataPublication',
            'metadata.title': null,
            'dateCreated': null
        },
        queryParams: {
            'title': {
                type: 'string',
                path: 'metadata.title',
                queryType: 'contains',
                whenUndefined: 'defaultValue',
                defaultValue: ''
            },
            'dateCreatedBefore': {
                type: 'string',
                path: 'dateCreated',
                queryType: '<=',
                whenUndefined: 'defaultValue',
                defaultValue: '3000-01-01T00:00:00.000Z'
            },
            'dateCreatedAfter': {
                type: 'string',
                path: 'dateCreated',
                queryType: '>=',
                whenUndefined: 'defaultValue',
                defaultValue: '1900-01-01T00:00:00.000Z'
            },
            'dateModifiedBefore': {
                type: 'string',
                path: 'lastSaveDate',
                queryType: '<=',
                whenUndefined: 'defaultValue',
                defaultValue: '3000-01-01T00:00:00.000Z'
            },
            'dateModifiedAfter': {
                type: 'string',
                path: 'lastSaveDate',
                queryType: '>=',
                whenUndefined: 'defaultValue',
                defaultValue: '1900-01-01T00:00:00.000Z'
            }
        }
    },
    'listEmbargoedDPRecords': {
        collectionName: 'record',
        brandIdFieldPath: 'metaMetadata.brandId',
        resultObjectMapping: {},
        mongoQuery: {
            'metaMetadata.type': 'dataPublication',
            'workflow.stage': 'embargoed',
            'metadata.title': null,
            'metadata.embargoUntil': null,
            'dateCreated': null
        },
        queryParams: {
            'title': {
                type: 'string',
                path: 'metadata.title',
                queryType: 'contains',
                whenUndefined: 'defaultValue',
                defaultValue: ''
            },
            'dateCreatedBefore': {
                type: 'string',
                path: 'dateCreated',
                queryType: '<=',
                whenUndefined: 'defaultValue',
                defaultValue: '3000-01-01T00:00:00.000Z'
            },
            'dateCreatedAfter': {
                type: 'string',
                path: 'dateCreated',
                queryType: '>=',
                whenUndefined: 'defaultValue',
                defaultValue: '1900-01-01T00:00:00.000Z'
            },
            'dateModifiedBefore': {
                type: 'string',
                path: 'lastSaveDate',
                queryType: '<=',
                whenUndefined: 'defaultValue',
                defaultValue: '3000-01-01T00:00:00.000Z'
            },
            'dateModifiedAfter': {
                type: 'string',
                path: 'lastSaveDate',
                queryType: '>=',
                whenUndefined: 'defaultValue',
                defaultValue: '1900-01-01T00:00:00.000Z'
            },
            'dateEmbargoedBefore': {
                type: 'string',
                path: 'metadata.embargoUntil',
                queryType: '<=',
                whenUndefined: 'defaultValue',
                defaultValue: '3000-01-01T00:00:00.000Z'
            },
            'dateEmbargoedAfter': {
                type: 'string',
                path: 'metadata.embargoUntil',
                queryType: '>=',
                whenUndefined: 'defaultValue',
                defaultValue: '1900-01-01T00:00:00.000Z'
            }
        }
    },
    'listWorkspaceRecords': {
        collectionName: 'record',
        brandIdFieldPath: 'metaMetadata.brandId',
        resultObjectMapping: {},
        mongoQuery: {
            'metaMetadata.packageType': 'workspace',
            'metadata.title': null,
            'dateCreated': null
        },
        queryParams: {
            'title': {
                type: 'string',
                path: 'metadata.title',
                queryType: 'contains',
                whenUndefined: 'defaultValue',
                defaultValue: ''
            },
            'dateCreatedBefore': {
                type: 'string',
                path: 'dateCreated',
                queryType: '<=',
                whenUndefined: 'defaultValue',
                defaultValue: '3000-01-01T00:00:00.000Z'
            },
            'dateCreatedAfter': {
                type: 'string',
                path: 'dateCreated',
                queryType: '>=',
                whenUndefined: 'defaultValue',
                defaultValue: '1900-01-01T00:00:00.000Z'
            },
            'dateModifiedBefore': {
                type: 'string',
                path: 'lastSaveDate',
                queryType: '<=',
                whenUndefined: 'defaultValue',
                defaultValue: '3000-01-01T00:00:00.000Z'
            },
            'dateModifiedAfter': {
                type: 'string',
                path: 'lastSaveDate',
                queryType: '>=',
                whenUndefined: 'defaultValue',
                defaultValue: '1900-01-01T00:00:00.000Z'
            }
        }
    },
    'listDraftInactiveRDMPRecords': {
        collectionName: 'record',
        brandIdFieldPath: 'metaMetadata.brandId',
        resultObjectMapping: {},
        mongoQuery: {
            'metaMetadata.type': 'rdmp',
            'workflow.stage': 'draft'
        },
        queryParams: {
            'lastSaveDateToCheck': {
                type: 'date',
                path: 'lastSaveDate',
                queryType: '<=',
                format: 'days',
                whenUndefined: 'defaultValue',
                defaultValue: '-365'
            }
        }
    },
    'listUsers': {
        collectionName: 'user',
        resultObjectMapping: {
            type: '<%= record.type %>',
            name: '<%= record.name %>',
            email: '<%= record.email %>',
            username: '<%= record.username %>',
            lastLogin: '<%= record.lastLogin %>'
        },
        mongoQuery: {},
        queryParams: {
            'dateCreatedBefore': {
                type: 'string',
                path: 'createdAt',
                queryType: '<=',
                whenUndefined: 'defaultValue',
                defaultValue: '3000-01-01T00:00:00.000Z'
            },
            'dateCreatedAfter': {
                type: 'string',
                path: 'createdAt',
                queryType: '>=',
                whenUndefined: 'defaultValue',
                defaultValue: '1900-01-01T00:00:00.000Z'
            },
            'lastLoginBefore': {
                type: 'string',
                path: 'lastLogin',
                queryType: '<=',
                whenUndefined: 'defaultValue',
                defaultValue: '3000-01-01T00:00:00.000Z'
            },
            'lastLoginAfter': {
                type: 'string',
                path: 'lastLogin',
                queryType: '>=',
                whenUndefined: 'defaultValue',
                defaultValue: '1900-01-01T00:00:00.000Z'
            },
            'userType': {
                type: 'string',
                path: 'type',
                whenUndefined: 'ignore'
            }
        }
    },
    'listParties': {
        collectionName: 'record',
        brandIdFieldPath: 'metaMetadata.brandId',
        resultObjectMapping: {
            'fullName': '<%= record.metadata.fullName %>',
            'l_fullName': '<%= record.metadata.l_fullName %>',
            'email': '<%= record.metadata.email %>',
            'givenName': '<%= record.metadata.givenName %>',
            'surname': '<%= record.metadata.surname %>',
            'orcid': '<%= record.metadata.orcid %>',
        },
        mongoQuery: {
            'metaMetadata.type': 'party',
            'metadata.l_fullName': null
        },
        sort: [{ "metadata.l_text_full_name": "ASC" }],
        queryParams: {
            'search': {
                type: 'string',
                path: 'metadata.l_fullName',
                template: '<%= _.toLower(value) %>',
                queryType: 'contains',
                whenUndefined: 'ignore'
            }
        }
    }
};
