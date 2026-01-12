/**
 * Branding Config Interface
 * (sails.config.branding)
 * 
 * Branding variable allowlist and settings.
 */

export interface BrandingConfig {
    /** Allowed SCSS variable names for branding customization */
    variableAllowList: string[];

    /** Maximum logo upload size in bytes */
    logoMaxBytes: number;

    /** In-memory logo cache TTL in milliseconds */
    logoCacheTtlMs: number;
}

// Note: Default values contain a large array of variable names.
// The original config/branding.js file should be kept for maintainability.
