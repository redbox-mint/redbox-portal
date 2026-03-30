/**
 * CORS Config Interface
 * (sails.config.cors)
 * 
 * Cross-Origin Resource Sharing settings.
 */

export interface CorsConfig {
    /** Allow CORS on all routes by default */
    allRoutes?: boolean;

    /** Allowed origin domains (comma-delimited or '*' for all) */
    origin?: string;

    /** Allow cookies for CORS requests */
    credentials?: boolean;

    /** Allowed HTTP methods for CORS requests */
    methods?: string;

    /** Allowed headers for CORS requests */
    headers?: string;

    /** Exposed headers in response */
    exposeHeaders?: string;
}

export const cors: CorsConfig = {};
