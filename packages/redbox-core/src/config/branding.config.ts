import { brandingThemeAllowedVariableNames } from '../services/BrandingThemeTokens';

/**
 * Branding Config Interface
 * (sails.config.branding)
 *
 * Branding variable allowlist and settings.
 * Values are runtime CSS custom properties, not Sass variables.
 */

export interface BrandingConfig {
    /** Allowed runtime CSS custom-property names for branding customization */
    variableAllowList: string[];

    /** Maximum logo upload size in bytes */
    logoMaxBytes: number;

    /** In-memory logo cache TTL in milliseconds */
    logoCacheTtlMs: number;
}

/**
 * Default branding configuration
 */
export const branding: BrandingConfig = {
    /**
     * Keys allowed in BrandingConfig.variables.
     * Exposed values are color-only; alias forms are retained for compatibility.
     */
    variableAllowList: brandingThemeAllowedVariableNames,
    /** Maximum logo upload size in bytes */
    logoMaxBytes: 512 * 1024,
    /** In-memory logo cache TTL in milliseconds */
    logoCacheTtlMs: 24 * 60 * 60 * 1000
};
