/**
 * Record Config Interface and Default Values
 * Auto-generated from config/record.js
 */

export interface RecordAuditingConfig {
    enabled: boolean;
    recordAuditJobName: string;
}

export interface RecordBaseUrlConfig {
    redbox: string;
    mint: string;
}

export interface RecordAPIEndpoint {
    method: 'get' | 'post' | 'put' | 'patch' | 'delete';
    url: string;
    readTimeout?: number;
}

export interface RecordCustomFieldConfig {
    source: 'request' | 'metadata' | 'record';
    type?: 'session' | 'param' | 'user' | 'header';
    field?: string;
    parseUrl?: boolean;
    searchParams?: string;
}

export interface RecordExportConfig {
    maxRecords: number;
}

export interface RecordTransferConfig {
    maxRecordsPerPage: number;
}

export interface RecordSearchConfig {
    returnFields: string[];
    maxRecordsPerPage: number;
}

export interface RecordAttachmentsConfig {
    path: string;
    store?: 'file' | 's3';
    file?: {
        directory: string;
    };
    s3?: {
        bucket: string;
        region: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        endpoint?: string;
        partSize?: number;
    };
    /** @deprecated Use file.directory instead. */
    stageDir?: string;
}

export interface RecordFormConfig {
    htmlSanitizationMode: 'sanitize' | 'reject';
}

export interface RecordFormConfig {
    htmlSanitizationMode: 'sanitize' | 'reject';
}

export interface RecordConfig {
    auditing: RecordAuditingConfig;
    baseUrl: RecordBaseUrlConfig;
    maxUploadSize: number;
    mongodbDisk: string;
    diskSpaceThreshold: number;
    checkTotalSizeOfFilesInRecordLogLevel?: string;
    processRecordCountersLogLevel?: string;
    api: Record<string, RecordAPIEndpoint>;
    customFields: Record<string, RecordCustomFieldConfig>;
    export: RecordExportConfig;
    transfer: RecordTransferConfig;
    search: RecordSearchConfig;
    attachments: RecordAttachmentsConfig;
    datastreamService?: string;
    helpEmail: string;
    form?: RecordFormConfig;
}

export const record: RecordConfig = {
    auditing: {
        enabled: true,
        recordAuditJobName: 'RecordsService-StoreRecordAudit'
    },
    baseUrl: {
        redbox: "http://localhost:9000/redbox",
        mint: "https://demo.redboxresearchdata.com.au/mint"
    },
    maxUploadSize: 1073741824,
    mongodbDisk: '/attachments',
    diskSpaceThreshold: 10737418240,
    form: {
        htmlSanitizationMode: 'sanitize'
    },
    api: {
        create: { method: 'post', url: "/api/v1/object/$packageType" },
        search: { method: 'get', url: "/api/v1/search" },
        query: { method: 'post', url: "/api/v2/query" },
        getMeta: { method: 'get', url: "/api/v1/recordmetadata/$oid" },
        info: { method: 'get', url: "/api/v1/info" },
        updateMeta: { method: 'post', url: "/api/v1/recordmetadata/$oid" },
        harvest: { method: 'post', url: "/api/v1.1/harvest/$packageType" },
        getDatastream: { method: 'get', url: "/api/v1/datastream/$oid", readTimeout: 120000 },
        addDatastream: { method: 'post', url: "/api/v1/datastream/$oid" },
        removeDatastream: { method: 'delete', url: "/api/v1/datastream/$oid" },
        addDatastreams: { method: 'put', url: "/api/v1/datastream/$oid" },
        addAndRemoveDatastreams: { method: 'patch', url: "/api/v1/datastream/$oid" },
        listDatastreams: { method: 'get', url: "/api/v2/datastream/$oid/list" },
        getRecordRelationships: { method: 'post', url: "/api/v2/recordmetadata/$oid/relationships" },
        delete: { method: 'delete', url: "/api/v1/object/$oid/delete" }
    },
    customFields: {
        '@branding': {
            source: 'request',
            type: 'session',
            field: 'branding'
        },
        '@portal': {
            source: 'request',
            type: 'session',
            field: 'portal'
        },
        '@oid': {
            source: 'request',
            type: 'param',
            field: 'oid'
        },
        '@user_name': {
            source: 'request',
            type: 'user',
            field: 'name'
        },
        '@user_email': {
            source: 'request',
            type: 'user',
            field: 'email'
        },
        '@user_username': {
            source: 'request',
            type: 'user',
            field: 'username'
        },
        '@referrer_rdmp': {
            source: 'request',
            type: 'header',
            field: 'referrer',
            parseUrl: true,
            searchParams: 'rdmp'
        },
        '@metadata': {
            source: 'metadata'
        },
        '@record': {
            source: 'record'
        }
    },
    export: {
        maxRecords: 20
    },
    transfer: {
        maxRecordsPerPage: 1000000
    },
    search: {
        returnFields: ['title', 'description', 'storage_id'],
        maxRecordsPerPage: 1000000
    },
    attachments: {
        path: '/attach',
        store: 'file',
        file: {
            directory: '/attachments/staging'
        }
    },
    helpEmail: 'support@redboxresearchdata.com.au'
};
