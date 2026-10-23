import _ from 'lodash';
import {
  OniPublishing,
  type OniPublishingConfigData,
  type OniPublishingSiteConfig,
} from '../../configmodels/OniPublishing';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { RBValidationError } from '../../model/RBValidationError';
import type { OniRecordModel, ResolvedOniPublishingConfigData } from '../../services/oni-v2/types';

const APP_CONFIG_PRESENT_KEYS_SYMBOL = Symbol.for('redbox.appConfig.presentKeys');
type BrandConfigRecord = {
  oniPublishing?: Partial<OniPublishingConfigData>;
  [APP_CONFIG_PRESENT_KEYS_SYMBOL]?: ReadonlySet<string>;
};

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

function hasStoredAppConfigKey(config: BrandConfigRecord | undefined, key: string): boolean {
  const presentKeys = config?.[APP_CONFIG_PRESENT_KEYS_SYMBOL];
  return presentKeys instanceof Set ? presentKeys.has(key) : true;
}

function resolveBrandId(record?: OniRecordModel): string {
  const raw = String(record?.metaMetadata?.brandId ?? record?.branding ?? '').trim();
  return raw === '' ? 'default' : raw;
}

export interface OniConfigurationInput {
  configuration(name: string): BrandConfigRecord | undefined;
  brandById(value: string): BrandingModel | undefined;
  brandByName(value: string): BrandingModel | undefined;
  warn(message: string): void;
}
export function getBrandName(input: OniConfigurationInput, record?: OniRecordModel): string {
  const raw = resolveBrandId(record);
  const brand = input.brandById(raw) ?? input.brandByName(raw);
  if (brand?.name) return brand.name;
  input.warn('OniService - unable to resolve publishing brand; using the configured lookup');
  return raw;
}
export function getBrand(input: OniConfigurationInput, record?: OniRecordModel): BrandingModel {
  const brand = input.brandByName(getBrandName(input, record));
  if (!brand) throw new Error('Cannot resolve Oni publishing brand');
  return brand;
}

export function resolveOniPublishingConfig(
  input: OniConfigurationInput,
  record?: OniRecordModel
): ResolvedOniPublishingConfigData | null {
  const brandName = getBrandName(input, record);
  const defaultAppConfig = input.configuration('default');
  const brandAppConfig = brandName === 'default' ? undefined : input.configuration(brandName);
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
