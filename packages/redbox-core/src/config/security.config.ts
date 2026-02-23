/**
 * Security Config Interface
 * (sails.config.security)
 * 
 * Security settings including CSRF protection.
 * Note: In modern Sails, CSRF is under security.csrf
 */

export interface CsrfConfig {
    /** Enable CSRF protection */
    csrf?: boolean | {
        /** Grant CSRF token via AJAX requests */
        grantTokenViaAjax?: boolean;
        /** Allowed origin for CSRF token requests */
        origin?: string;
    };
}

export interface SecurityConfig {
    /** CSRF protection settings */
    csrf: boolean;
}

export const security: SecurityConfig = {
    csrf: true,
};
