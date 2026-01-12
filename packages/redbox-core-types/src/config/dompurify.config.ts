/**
 * DOMPurify Config Interface
 * (sails.config.dompurify)
 * 
 * DOMPurify sanitization profiles and hooks.
 * Note: Contains function hooks, must stay as JS for runtime.
 */

export interface DomPurifyProfile {
    /** Use built-in profiles */
    USE_PROFILES?: { svg?: boolean; svgFilters?: boolean; html?: boolean };

    /** Allowed HTML/SVG tags */
    ALLOWED_TAGS?: string[];

    /** Allowed attributes */
    ALLOWED_ATTR?: string[];

    /** Forbidden tags */
    FORBID_TAGS?: string[];

    /** Forbidden attributes */
    FORBID_ATTR?: string[];

    /** Allow data-* attributes */
    ALLOW_DATA_ATTR?: boolean;

    /** Allow unknown protocols in URLs */
    ALLOW_UNKNOWN_PROTOCOLS?: boolean;

    /** Regex for allowed URI protocols */
    ALLOWED_URI_REGEXP?: RegExp;

    /** Sanitize DOM nodes */
    SANITIZE_DOM?: boolean;

    /** Keep content of removed elements */
    KEEP_CONTENT?: boolean;

    /** Modify input in place */
    IN_PLACE?: boolean;
}

export interface DomPurifyHooks {
    /** Hook called after attributes are sanitized */
    afterSanitizeAttributes?: (node: unknown) => void;

    /** Hook called before sanitization */
    beforeSanitizeElements?: (node: unknown) => void;

    /** Hook called after sanitization */
    afterSanitizeElements?: (node: unknown) => void;
}

export interface DomPurifyGlobalSettings {
    FORCE_BODY?: boolean;
    RETURN_DOM?: boolean;
    RETURN_DOM_FRAGMENT?: boolean;
    RETURN_TRUSTED_TYPE?: boolean;
}

export interface DomPurifyConfig {
    /** Sanitization profiles for different content types */
    profiles: {
        svg?: DomPurifyProfile;
        html?: DomPurifyProfile;
        minimal?: DomPurifyProfile;
        [profileName: string]: DomPurifyProfile | undefined;
    };

    /** Default profile to use */
    defaultProfile: string;

    /** DOMPurify hooks */
    hooks: DomPurifyHooks;

    /** Global settings */
    globalSettings: DomPurifyGlobalSettings;
}

// Note: Default values contain function hooks.
// The original config/dompurify.js file must be kept for runtime.
