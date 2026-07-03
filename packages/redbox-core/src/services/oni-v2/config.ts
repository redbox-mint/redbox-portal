import _ from 'lodash';
import {
  OniPublishing,
  type OniPublishingConfigData,
  type OniPublishingSiteConfig,
} from '../../configmodels/OniPublishing';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { RBValidationError } from '../../model/RBValidationError';
import type { OniRecordModel, ResolvedOniPublishingConfigData } from './types';

type BrandConfigRecord = Record<string, unknown> & {
  oniPublishing?: Partial<OniPublishingConfigData>;
};
const APP_CONFIG_PRESENT_KEYS_SYMBOL = Symbol.for('redbox.appConfig.presentKeys');

function mergeOniPublishingConfig(
  defaultConfig?: Partial<OniPublishingConfigData>,
  brandConfig?: Partial<OniPublishingConfigData>
): ResolvedOniPublishingConfigData {
  return _.mergeWith(
    new OniPublishing(),
    _.cloneDeep(defaultConfig ?? {}),
    _.cloneDeep(brandConfig ?? {}),
    (_value, sourceValue) => (Array.isArray(sourceValue) ? sourceValue : undefined)
  ) as ResolvedOniPublishingConfigData;
}

function getAppConfigurationForBrand(brandName: string): BrandConfigRecord | undefined {
  const appConfigService =
    typeof AppConfigService === 'undefined'
      ? undefined
      : (AppConfigService as unknown as {
          getAppConfigurationForBrand?: (name: string) => unknown;
        });
  const fromService = appConfigService?.getAppConfigurationForBrand?.(brandName);
  if (fromService != null && typeof fromService === 'object') {
    return fromService as BrandConfigRecord;
  }
  const fromBrandingAware = sails.config?.brandingAware?.(brandName);
  if (fromBrandingAware != null && typeof fromBrandingAware === 'object') {
    return fromBrandingAware as unknown as BrandConfigRecord;
  }
  const defaults = sails.config?.brandingConfigurationDefaults;
  if (defaults != null && typeof defaults === 'object') {
    return defaults as unknown as BrandConfigRecord;
  }
  return undefined;
}

function hasStoredAppConfigKey(config: BrandConfigRecord | undefined, key: string): boolean {
  const presentKeys = config == null ? undefined : (config as Record<PropertyKey, unknown>)[APP_CONFIG_PRESENT_KEYS_SYMBOL];
  return presentKeys instanceof Set ? presentKeys.has(key) : true;
}

function resolveBrandId(record?: OniRecordModel): string {
  const raw = String(record?.metaMetadata?.brandId ?? record?.branding ?? '').trim();
  return raw === '' ? 'default' : raw;
}

export function getBrandName(record?: OniRecordModel): string {
  const rawBrand = resolveBrandId(record);
  const brandingService = typeof BrandingService === 'undefined' ? undefined : BrandingService;
  if (brandingService == null) {
    return rawBrand;
  }
  const brandById =
    typeof brandingService.getBrandById === 'function' ? brandingService.getBrandById(rawBrand) : undefined;
  if (brandById?.name != null && String(brandById.name).trim() !== '') {
    return String(brandById.name);
  }
  const brandByName = typeof brandingService.getBrand === 'function' ? brandingService.getBrand(rawBrand) : undefined;
  if (brandByName != null) {
    const resolvedName = String((brandByName as { name?: unknown }).name ?? '').trim();
    return resolvedName === '' ? rawBrand : resolvedName;
  }
  sails.log.warn(`OniService - unable to resolve brand id or name '${rawBrand}'; using default branding config lookup`);
  return rawBrand;
}

export function getBrand(record?: OniRecordModel): BrandingModel {
  const brandName = getBrandName(record);
  const brand = BrandingService.getBrand(brandName);
  if (brand == null) {
    throw new Error(`Cannot resolve Oni publishing brand '${brandName}'`);
  }
  return brand;
}

export function resolveOniPublishingConfig(record?: OniRecordModel): ResolvedOniPublishingConfigData | null {
  const brandName = getBrandName(record);
  const defaultAppConfig = getAppConfigurationForBrand('default');
  const brandAppConfig = brandName === 'default' ? undefined : getAppConfigurationForBrand(brandName);
  const defaultRawConfig = defaultAppConfig?.oniPublishing;
  const brandRawConfig =
    brandAppConfig != null && hasStoredAppConfigKey(brandAppConfig, 'oniPublishing')
      ? brandAppConfig.oniPublishing
      : undefined;
  if (
    (defaultRawConfig == null || typeof defaultRawConfig !== 'object') &&
    (brandRawConfig == null || typeof brandRawConfig !== 'object')
  ) {
    throw new Error(
      `Cannot resolve Oni publishing config for brand '${brandName}': oniPublishing app-config is missing`
    );
  }

  const resolved = mergeOniPublishingConfig(defaultRawConfig, brandRawConfig);
  if (resolved.enabled !== true) {
    return null;
  }
  return resolved;
}

export function getRequestedOniSiteName(
  config: ResolvedOniPublishingConfigData,
  options: Record<string, unknown> = {}
): string {
  return String(options.site ?? config.defaultSite ?? '').trim();
}

export function resolveOniSite(
  config: ResolvedOniPublishingConfigData,
  options: Record<string, unknown> = {}
): { siteName: string; site: OniPublishingSiteConfig } {
  const requestedSite = getRequestedOniSiteName(config, options);
  if (requestedSite === '') {
    throw new RBValidationError({
      message: 'Cannot resolve Oni publishing site: options.site and oniPublishing.defaultSite are both empty',
      displayErrors: [
        {
          code: 'oni-site-missing',
          title: 'Oni publishing site is not configured',
          detail: 'Cannot resolve Oni publishing site: options.site and oniPublishing.defaultSite are both empty',
        },
      ],
    });
  }
  const site = config.sites[requestedSite];
  if (site == null) {
    throw new RBValidationError({
      message: `Unknown Oni publishing site '${requestedSite}'`,
      displayErrors: [
        {
          code: 'oni-site-unknown',
          title: 'Unknown Oni publishing site',
          detail: `Unknown Oni publishing site '${requestedSite}'`,
          meta: { site: requestedSite },
        },
      ],
    });
  }
  if (site.enabled !== true) {
    throw new RBValidationError({
      message: `Oni publishing site '${requestedSite}' is disabled`,
      displayErrors: [
        {
          code: 'oni-site-disabled',
          title: 'Oni publishing site is disabled',
          detail: `Oni publishing site '${requestedSite}' is disabled`,
          meta: { site: requestedSite },
        },
      ],
    });
  }
  return { siteName: requestedSite, site };
}
