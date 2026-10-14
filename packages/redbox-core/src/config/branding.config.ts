import { brandingThemeAllowedVariableNames } from '../services/BrandingThemeTokens';
import {
  BRANDING_HISTORY_MAX_VERSIONS,
  BRANDING_TYPEFACE_FACE_MAX_BYTES,
  BRANDING_TYPEFACE_FAMILY_MAX_BYTES,
  BRANDING_TYPEFACE_ORPHAN_GRACE_MS,
} from '../model/BrandingTypeface';

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

    /** Maximum compressed bytes for a newly uploaded typeface face */
    typefaceFaceMaxBytes: number;

    /** Maximum distinct compressed bytes referenced by a resulting custom draft */
    typefaceFamilyMaxBytes: number;

    /** Newest complete versions retained per brand */
    historyMaxVersions: number;

    /** Minimum unreferenced object age before orphan deletion */
    typefaceOrphanGraceMs: number;
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
    logoCacheTtlMs: 24 * 60 * 60 * 1000,
    /** Maximum compressed bytes for a newly uploaded typeface face */
    typefaceFaceMaxBytes: BRANDING_TYPEFACE_FACE_MAX_BYTES,
    /** Maximum distinct compressed bytes referenced by a resulting custom draft */
    typefaceFamilyMaxBytes: BRANDING_TYPEFACE_FAMILY_MAX_BYTES,
    /** Newest complete versions retained per brand */
    historyMaxVersions: BRANDING_HISTORY_MAX_VERSIONS,
    /** Minimum unreferenced object age before orphan deletion */
    typefaceOrphanGraceMs: BRANDING_TYPEFACE_ORPHAN_GRACE_MS,
};

/**
 * Branding sails globals shape for validated config lookup.
 */
interface BrandingSailsGlobals {
    sails?: {
        config?: { branding?: Partial<Record<keyof BrandingConfig, unknown>> };
        log?: { warn?: (message: string) => void };
    };
}

/**
 * Read a finite positive integer from `sails.config.branding`, falling back
 * to `defaultValue` with a logged warning for invalid operator configuration.
 */
export function getBrandingPositiveInt(key: keyof BrandingConfig, defaultValue: number): number {
    try {
        const configured = (globalThis as BrandingSailsGlobals).sails?.config?.branding?.[key];
        if (typeof configured === 'number' && Number.isSafeInteger(configured) && configured > 0) {
            return configured;
        }
    } catch {
        // Fall through to the default below.
    }
    try {
        (globalThis as BrandingSailsGlobals).sails?.log?.warn?.(
            `Invalid branding config '${String(key)}', falling back to default ${defaultValue}`
        );
    } catch {
        // Logging must never break config lookup.
    }
    return defaultValue;
}
