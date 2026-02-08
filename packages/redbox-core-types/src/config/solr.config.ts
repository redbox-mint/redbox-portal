/**
 * Solr Config Interface
 * (sails.config.solr)
 * 
 * Solr search service configuration.
 */

export interface SolrCoreOptions {
    https?: boolean;
    host: string;
    port: string | number;
    core: string;
}

export interface SolrFieldDefinition {
    name: string;
    type: string;
    indexed: boolean;
    stored: boolean;
    multiValued?: boolean;
    required?: boolean;
}

export interface SolrCopyFieldDefinition {
    source: string;
    dest: string;
}

export interface SolrPreIndexMoveConfig {
    source: string;
    dest: string;
}

export interface SolrPreIndexCopyConfig {
    source: string;
    dest: string;
}

export interface SolrFlattenOptions {
    safe?: boolean;
    delimiter?: string;
}

export interface SolrPreIndexFlattenSpecial {
    source: string;
    dest?: string;
    options?: SolrFlattenOptions;
}

export interface SolrPreIndexFlattenConfig {
    options?: SolrFlattenOptions;
    special?: SolrPreIndexFlattenSpecial[];
}

export interface SolrPreIndexConfig {
    move?: SolrPreIndexMoveConfig[];
    copy?: SolrPreIndexCopyConfig[];
    flatten?: SolrPreIndexFlattenConfig;
}

export interface SolrCoreSchema {
    'add-field': SolrFieldDefinition[];
    'add-dynamic-field': SolrFieldDefinition[];
    'add-copy-field': SolrCopyFieldDefinition[];
}

export interface SolrCoreConfig {
    options: SolrCoreOptions;
    schema: SolrCoreSchema;
    preIndex?: SolrPreIndexConfig;
    initSchemaFlag?: SolrFieldDefinition;
}

export interface SolrSearchConfig {
    createOrUpdateJobName: string;
    deleteJobName: string;
    maxWaitTries: number;
    waitTime: number;
    clientSleepTimeMillis?: number;
    cores: {
        [coreName: string]: SolrCoreConfig;
    };
}

export const solr: SolrSearchConfig = {
    createOrUpdateJobName: 'SolrSearchService-CreateOrUpdateIndex',
    deleteJobName: 'SolrSearchService-DeleteFromIndex',
    maxWaitTries: 12,
    waitTime: 5000,
    cores: {
        default: {
            options: {
                host: 'solr',
                port: '8983',
                core: 'redbox'
            },
            schema: {
                'add-field': [
                    { name: 'full_text', type: 'text_general', indexed: true, stored: false, multiValued: true },
                    { name: 'title', type: 'text_general', indexed: true, stored: true, multiValued: false },
                    { name: 'description', type: 'text_general', indexed: true, stored: true, multiValued: false },
                    { name: 'grant_number_name', type: 'text_general', indexed: true, stored: true, multiValued: true },
                    { name: 'finalKeywords', type: 'text_general', indexed: true, stored: true, multiValued: true },
                    { name: 'text_title', type: 'text_general', indexed: true, stored: true, multiValued: true },
                    { name: 'text_description', type: 'text_general', indexed: true, stored: true, multiValued: true },
                    { name: 'authorization_view', type: 'text_general', indexed: true, stored: true, multiValued: true },
                    { name: 'authorization_edit', type: 'text_general', indexed: true, stored: true, multiValued: true },
                    { name: 'authorization_viewPending', type: 'text_general', indexed: true, stored: true, multiValued: true },
                    { name: 'authorization_editPending', type: 'text_general', indexed: true, stored: true, multiValued: true },
                    { name: 'redboxOid', type: 'text_general', indexed: true, stored: true, multiValued: false },
                    { name: 'authorization_viewRoles', type: 'text_general', indexed: true, stored: true, multiValued: true },
                    { name: 'authorization_editRoles', type: 'text_general', indexed: true, stored: true, multiValued: true },
                    { name: 'metaMetadata_brandId', type: 'text_general', indexed: true, stored: true, multiValued: false },
                    { name: 'metaMetadata_type', type: 'text_general', indexed: true, stored: true, multiValued: false },
                    { name: 'workflow_stageLabel', type: 'text_general', indexed: true, stored: true, multiValued: false },
                    { name: 'workflow_step', type: 'text_general', indexed: true, stored: true, multiValued: false }
                ],
                'add-dynamic-field': [
                    { name: 'date_*', type: 'pdate', indexed: true, stored: true }
                ],
                'add-copy-field': [
                    { source: '*', dest: 'full_text' },
                    { source: 'title', dest: 'text_title' },
                    { source: 'description', dest: 'text_description' }
                ]
            },
            preIndex: {
                move: [
                    { source: 'metadata', dest: '' }
                ],
                copy: [
                    { source: 'metaMetadata.createdOn', dest: 'date_object_created' },
                    { source: 'lastSaveDate', dest: 'date_object_modified' }
                ],
                flatten: {
                    special: [
                        { source: 'workflow', options: { safe: false, delimiter: '_' } },
                        { source: 'authorization', options: { safe: true, delimiter: '_' } },
                        { source: 'metaMetadata', options: { safe: false, delimiter: '_' } },
                        { source: 'metadata.finalKeywords', dest: 'finalKeywords', options: { safe: true } }
                    ]
                }
            },
            initSchemaFlag: {
                name: 'schema_initialised',
                type: 'text_general',
                stored: false,
                required: false,
                indexed: false
            }
        }
    }
};
