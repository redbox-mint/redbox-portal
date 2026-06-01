/**
 * Custom Config Interface
 * (sails.config.custom)
 * 
 * Custom application settings.
 */

export interface CustomCacheControlConfig {
    /** Paths that should not be cached */
    noCache: string[];
}

export interface CustomBodyParserConfig {
    /** Route patterns that should bypass the body parser */
    skipPaths: string[] | Record<string, string>;
}

export interface CustomConfig {
    /** Cache control settings */
    cacheControl: CustomCacheControlConfig;

    /** Body parser settings */
    bodyParser: CustomBodyParserConfig;
}

export const custom: CustomConfig = {
    cacheControl: {
        noCache: [
            'csrfToken',
            'dynamic/apiClientConfig',
            'login',
            'begin_oidc',
            'login_oidc',
            'logout'
        ]
    },
    bodyParser: {
        skipPaths: {
            attachmentUpload: '/:branding/:portal/record/:oid/attach',
            attachmentUploadById: '/:branding/:portal/record/:oid/attach/:attachId',
            companionAttachmentUpload: '/:branding/:portal/companion/record/:oid/attach',
            companionAttachmentUploadById: '/:branding/:portal/companion/record/:oid/attach/:attachId',
            openIdConnectLogin: '/user/login_oidc'
        }
    }
};
