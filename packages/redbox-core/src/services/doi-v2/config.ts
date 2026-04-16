import _ from 'lodash';
import {
  DoiPublishing,
  resolveDoiConnectionPassword
} from '../../configmodels/DoiPublishing';
import type { DoiRecordModel } from './types';
import type { BrandingModel } from '../../model/storage/BrandingModel';

const DOI_PASSWORD_FALLBACK_ENV_VARS = [
  'DOI_CONNECTION_PASSWORD',
  'DATACITE_PASSWORD'
] as const;

function resolveBrandConfig(brandName: string): DoiPublishing | null {
  const appConfig = sails.config.brandingAware(brandName).doiPublishing as DoiPublishing | undefined;
  if (appConfig?.enabled === true) {
    const resolvedConfig = _.cloneDeep(appConfig) as DoiPublishing;
    resolvedConfig.connection = {
      ...resolvedConfig.connection,
      password: resolveDoiConnectionPassword(resolvedConfig.connection.password, {
      fallbackEnvVarNames: [...DOI_PASSWORD_FALLBACK_ENV_VARS]
      })
    };
    return resolvedConfig;
  }
  return null;
}

export function resolveDoiPublishingConfig(
  record?: DoiRecordModel
): DoiPublishing | null {
  const brandId = record?.metaMetadata?.brandId;
  if (!brandId) {
    throw new Error('Cannot resolve DOI publishing config: record does not have a brand');
  }
  const brandName = BrandingService.getBrandById(brandId)?.name;
  if (_.isEmpty(brandName)) {
    throw new Error(`Cannot resolve DOI publishing config: unknown brand id '${brandId}'`);
  }
  return resolveBrandConfig(String(brandName));
}

export function resolveDoiPublishingConfigForBrand(
  branding: BrandingModel | string
): DoiPublishing | null {
  const brandName = typeof branding === 'string' ? branding : branding?.name;
  if (_.isEmpty(brandName)) {
    throw new Error('Cannot resolve DOI publishing config: brand name is required');
  }
  return resolveBrandConfig(String(brandName));
}

export async function resolveDoiPublishingConfigAsync(
  record?: DoiRecordModel
): Promise<DoiPublishing | null> {
  // Always use cached branding-aware config; do not hit AppConfigService
  return resolveDoiPublishingConfig(record);
}
