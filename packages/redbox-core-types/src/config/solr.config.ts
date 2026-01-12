/**
 * Solr Config Interface
 * (sails.config.solr)
 * 
 * Solr search service configuration.
 * Note: Contains complex schema definitions - interface only.
 */

export interface SolrCoreOptions {
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
}

export interface SolrCopyFieldDefinition {
    source: string;
    dest: string;
}

export interface SolrCoreSchema {
    'add-field'?: SolrFieldDefinition[];
    'add-copy-field'?: SolrCopyFieldDefinition[];
}

export interface SolrCoreConfig {
    options: SolrCoreOptions;
    schema: SolrCoreSchema;
}

export interface SolrSearchConfig {
    /** Job name for create/update operations */
    createOrUpdateJobName: string;
    /** Job name for delete operations */
    deleteJobName: string;
    /** Maximum wait tries */
    maxWaitTries: number;
    /** Wait time between tries in ms */
    waitTime: number;
    /** Solr core configurations */
    cores: {
        [coreName: string]: SolrCoreConfig;
    };
}

// Note: Default values contain complex schema definitions.
// The original config/solr.js file should be kept for runtime.
