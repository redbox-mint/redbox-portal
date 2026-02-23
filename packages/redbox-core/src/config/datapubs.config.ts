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
    tempPath?: string;
    repoScratch?: string;
    url: string;
}

export interface DataPubsSites extends Record<string, DataPubsSiteConfig> {
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

export interface DataPubsDefaultIriPrefs {
    about: Record<string, string>;
    spatialCoverage: string;
    funder: string;
    license: string;
    citation: string;
    contact: string;
    location: string;
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
    DEFAULT_IRI_PREFS: DataPubsDefaultIriPrefs;
}

export interface DataPubsConfig {
    rootCollection: DataPubsRootCollection;
    sites: DataPubsSites;
    metadata: DataPubsMetadata;
}

export const datapubs: DataPubsConfig = {
    rootCollection: {
        targetRepoNamespace: 'uts_public_data_repo',
        rootCollectionId: 'arcp://name,data_repo/root_collection',
        targetRepoColId: 'root_collection',
        targetRepoColName: '',
        targetRepoColDescription: 'This is a sample data portal. For any questions, please get in touch with us at info@redboxresearchdata.com.au',
        dsType: ['Dataset', 'RepositoryCollection'],
        enableDatasetToUseDefaultLicense: true,
        defaultLicense: {
            '@id': 'http://creativecommons.org/licenses/by/4.0',
            '@type': 'OrganizationReuseLicense',
            name: 'Attribution 4.0 International (CC BY 4.0)',
            description: 'You are free to share (copy and redistribute the material in any medium or format) and adapt (remix, transform and build upon the material for any purpose, even commercially).'
        }
    },
    sites: {
        staging: {
            useCleanUrl: false,
            dir: '/opt/oni/staged/ocfl',
            tempDir: '/opt/oni/staged/temp',
            url: 'http://localhost:11000'
        },
        public: {
            useCleanUrl: false,
            dir: '/opt/oni/public/ocfl',
            url: 'http://localhost:11000/publication'
        }
    },
    metadata: {
        html_filename: 'ro-crate-preview.html',
        jsonld_filename: 'ro-crate-metadata.jsonld',
        datapub_json: 'datapub.json',
        identifier_namespace: 'public_ocfl',
        render_script: '',
        organization: {
            '@id': 'https://www.redboxresearchdata.com.au',
            '@type': 'Organization',
            identifier: 'https://www.redboxresearchdata.com.au',
            name: 'ReDBox Research Data'
        },
        related_works: [
            { field: 'publications', type: 'ScholarlyArticle' },
            { field: 'websites', type: 'WebSite' },
            { field: 'metadata', type: 'CreativeWork' },
            { field: 'data', type: 'Dataset' },
            { field: 'services', type: 'CreativeWork' }
        ],
        funders: ['foaf:fundedBy_foaf:Agent', 'foaf:fundedBy_vivo:Grant'],
        subjects: ['dc:subject_anzsrc:for', 'dc:subject_anzsrc:seo'],
        DEFAULT_IRI_PREFS: {
            about: {
                'dc:subject_anzsrc:for': '_:FOR/',
                'dc:subject_anzsrc:seo': '_:SEO/'
            },
            spatialCoverage: '_:spatial/',
            funder: '_:funder/',
            license: '_:license/',
            citation: '_:citation/',
            contact: '_:contact/',
            location: '_:location/'
        }
    }
};
