/**
 * Companion Config
 * (sails.config.companion)
 *
 * Uppy Companion middleware configuration.
 */

export interface CompanionServerConfig {
    host: string;
    protocol: string;
    path: string;
}

export interface CompanionProviderCredentials {
    key: string;
    secret: string;
}

export interface CompanionProviderOptions {
    drive: CompanionProviderCredentials;
    onedrive: CompanionProviderCredentials;
    [provider: string]: unknown;
}

export interface CompanionConfig {
    enabled: boolean;
    route: string;
    secret: string;
    bearerToken: string;
    attachmentSecret: string;
    attachmentSecretHeader: string;
    attachmentLocalOnly: boolean;
    filePath: string;
    uploadUrls: string[];
    tusDeferredUploadLength: boolean;
    server: CompanionServerConfig;
    providerOptions: CompanionProviderOptions;
    uploadHeaders?: Record<string, string>;
    corsOrigins?: true | string[];
    metrics?: boolean;
    debug?: boolean;
    i18n?: Record<string, unknown>;
}

export const companion: CompanionConfig = {
    enabled: process.env.UPPY_COMPANION_ENABLED === 'true',
    route: '/companion',
    secret: process.env.UPPY_COMPANION_SECRET || '',
    bearerToken: process.env.UPPY_COMPANION_BEARER_TOKEN || '',
    attachmentSecret: process.env.UPPY_COMPANION_ATTACHMENT_SECRET || process.env.UPPY_COMPANION_SECRET || '',
    attachmentSecretHeader: process.env.UPPY_COMPANION_ATTACHMENT_SECRET_HEADER || 'x-companion-secret',
    attachmentLocalOnly: process.env.UPPY_COMPANION_ATTACHMENT_LOCAL_ONLY !== 'false',
    filePath: process.env.UPPY_COMPANION_FILE_PATH || '/tmp/companion',
    uploadUrls: (process.env.UPPY_COMPANION_UPLOAD_URLS || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean),
    tusDeferredUploadLength: process.env.UPPY_COMPANION_TUS_DEFERRED_UPLOAD_LENGTH !== 'false',
    server: {
        host: process.env.UPPY_COMPANION_HOST || 'localhost:1500',
        protocol: process.env.UPPY_COMPANION_PROTOCOL || 'http',
        path: process.env.UPPY_COMPANION_PATH || '/companion'
    },
    providerOptions: {
        drive: {
            key: process.env.UPPY_GOOGLE_KEY || '',
            secret: process.env.UPPY_GOOGLE_SECRET || ''
        },
        onedrive: {
            key: process.env.UPPY_ONEDRIVE_KEY || '',
            secret: process.env.UPPY_ONEDRIVE_SECRET || ''
        }
    }
};
