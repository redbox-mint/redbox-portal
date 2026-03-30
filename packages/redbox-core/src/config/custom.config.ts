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

export interface CustomConfig {
    /** Cache control settings */
    cacheControl: CustomCacheControlConfig;
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
    }
};
