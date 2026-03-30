/**
 * Content Security Policy Config Interface
 * (sails.config.csp)
 * 
 * CSP header configuration for the contentSecurityPolicy policy.
 */

export type CspDirectiveValue = string[];

export interface CspDirectives {
    /** Default source for all resource types */
    'default-src'?: CspDirectiveValue;
    /** Script sources */
    'script-src'?: CspDirectiveValue;
    /** Worker script sources */
    'worker-src'?: CspDirectiveValue;
    /** Image sources */
    'img-src'?: CspDirectiveValue;
    /** XHR/Fetch/WebSocket sources */
    'connect-src'?: CspDirectiveValue;
    /** Audio/Video sources */
    'media-src'?: CspDirectiveValue;
    /** Frame sources */
    'frame-src'?: CspDirectiveValue;
    /** Plugin sources (object, embed, applet) */
    'object-src'?: CspDirectiveValue;
    /** Manifest sources */
    'manifest-src'?: CspDirectiveValue;
    /** Stylesheet sources */
    'style-src'?: CspDirectiveValue;
    /** Font sources */
    'font-src'?: CspDirectiveValue;
    /** Frame ancestors */
    'frame-ancestors'?: CspDirectiveValue;
    /** Form action targets */
    'form-action'?: CspDirectiveValue;
    /** Base URI */
    'base-uri'?: CspDirectiveValue;
    /** Additional directives */
    [directive: string]: CspDirectiveValue | undefined;
}

export interface ContentSecurityPolicyConfig {
    /** Enable/disable emitting a CSP header */
    enabled: boolean;

    /** Use Report-Only header instead of enforcing */
    reportOnly: boolean;

    /** Directive names that should receive a per-request nonce */
    addNonceTo: string[];

    /** CSP directives map */
    directives: CspDirectives;

    /** Raw, valueless directives appended as-is */
    extras: string[];
}

export const csp: ContentSecurityPolicyConfig = {
    enabled: true,
    reportOnly: false,
    addNonceTo: ['script-src', 'style-src'],
    directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'worker-src': ["'self'"],
        'img-src': ["'self'", 'https://*.tile.openstreetmap.org'],
        'connect-src': ["'self'"],
        'media-src': ["'self'"],
        'frame-src': ["'self'"],
        'object-src': ["'none'"],
        'manifest-src': ["'self'"],
        'style-src': ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
        'font-src': ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'base-uri': ["'self'"],
    },
    extras: ['upgrade-insecure-requests'],
};
