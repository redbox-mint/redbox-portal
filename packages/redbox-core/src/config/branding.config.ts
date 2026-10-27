import { brandingThemeAllowedVariableNames } from '../services/BrandingThemeTokens';
import {
  BRANDING_HISTORY_MAX_VERSIONS,
  BRANDING_TYPEFACE_FACE_MAX_BYTES,
  BRANDING_TYPEFACE_FAMILY_MAX_BYTES,
  BRANDING_TYPEFACE_ORPHAN_GRACE_MS,
} from '../model/BrandingTypeface';

/**
 * Branding Config Interface
 * (configuration.branding)
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
 * Branding configuration shape for validated config lookup.
 */
/** Read an explicit operator setting, warning and using the default if invalid. */
export function getBrandingPositiveInt(
  config: object,
  log: { warn(message: string): void },
  key: string,
  defaultValue: number
): number {
  const configured: unknown = Reflect.get(config, key);
  if (typeof configured === 'number' && Number.isSafeInteger(configured) && configured > 0) return configured;
  log.warn(`Invalid branding config '${String(key)}', falling back to default ${defaultValue}`);
  return defaultValue;
}
