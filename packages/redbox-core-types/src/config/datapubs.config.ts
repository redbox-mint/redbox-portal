/**
 * Data Publications Config Interface
 * (sails.config.datapubs)
 * 
 * Data publication portal configuration.
 */

export interface DataPubsLicense {
    '@id': string;
    '@type': string;
    name: string;
    description: string;
}

export interface DataPubsRootCollection {
    targetRepoNamespace: string;
    rootCollectionId: string;
    targetRepoColId: string;
    targetRepoColName: string;
    targetRepoColDescription: string;
    dsType: string[];
    enableDatasetToUseDefaultLicense: boolean;
    defaultLicense: DataPubsLicense;
}

export interface DataPubsSiteConfig {
    useCleanUrl: boolean;
    dir: string;
    tempDir?: string;
    url: string;
}

export interface DataPubsSites {
    staging: DataPubsSiteConfig;
    public: DataPubsSiteConfig;
}

export interface DataPubsOrganization {
    '@id': string;
    '@type': string;
    identifier: string;
    name: string;
}

export interface DataPubsRelatedWork {
    field: string;
    type: string;
}

export interface DataPubsMetadata {
    html_filename: string;
    jsonld_filename: string;
    datapub_json: string;
    identifier_namespace: string;
    render_script: string;
    organization: DataPubsOrganization;
    related_works: DataPubsRelatedWork[];
    funders: string[];
    subjects: string[];
    DEFAULT_IRI_PREFS: Record<string, unknown>;
}

export interface DataPubsConfig {
    rootCollection: DataPubsRootCollection;
    sites: DataPubsSites;
    metadata: DataPubsMetadata;
}

// Note: Default values contain complex metadata config.
// The original config/datapubs.js file should be kept.
