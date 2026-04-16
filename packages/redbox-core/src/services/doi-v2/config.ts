import _ from 'lodash';
import {
  DoiPublishing,
  resolveDoiConnectionPassword
} from '../../configmodels/DoiPublishing';
import type { DoiRecordModel } from './types';

const DOI_PASSWORD_FALLBACK_ENV_VARS = [
  'DOI_CONNECTION_PASSWORD',
  'DATACITE_PASSWORD'
] as const;



export function resolveDoiPublishingConfig(
  record?: DoiRecordModel
): DoiPublishing | null {
  const brandId = record?.metaMetadata?.brandId;
  if (!brandId) {
    throw new Error('Cannot resolve DOI publishing config: record does not have a brand');
  }
  const brandName = BrandingService.getBrandById(brandId)?.name;

  const appConfig = sails.config.brandingAware(brandName).doiPublishing as DoiPublishing | undefined;

  if (appConfig?.enabled === true) {
    appConfig.connection.password = resolveDoiConnectionPassword(appConfig.connection.password, {
      fallbackEnvVarNames: [...DOI_PASSWORD_FALLBACK_ENV_VARS]
    });
    return appConfig;
  }

  return null;
}

export async function resolveDoiPublishingConfigAsync(
  record?: DoiRecordModel
): Promise<DoiPublishing | null> {
  // Always use cached branding-aware config; do not hit AppConfigService
  return resolveDoiPublishingConfig(record);
}
