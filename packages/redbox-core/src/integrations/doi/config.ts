import _ from 'lodash';
import { resolveDoiConnectionPassword } from '../../configmodels/DoiPublishing';
import type { DoiRecordModel, DoiPublishing } from '../../services/doi-v2/types';
import type { BrandingModel } from '../../model/storage/BrandingModel';

export interface DoiConfigurationInput {
  configuration(brandName: string): DoiPublishing | undefined;
  brandById(id: string): BrandingModel | undefined;
  readonly env: Readonly<NodeJS.ProcessEnv>;
}

const DOI_PASSWORD_FALLBACK_ENV_VARS = ['DOI_CONNECTION_PASSWORD', 'DATACITE_PASSWORD'] as const;

function resolveBrandConfig(input: DoiConfigurationInput, brandName: string): DoiPublishing | null {
  const appConfig = input.configuration(brandName);
  if (appConfig?.enabled === true) {
    const resolvedConfig = _.cloneDeep(appConfig) as DoiPublishing;
    resolvedConfig.connection = {
      ...resolvedConfig.connection,
      password: resolveDoiConnectionPassword(resolvedConfig.connection.password, {
        fallbackEnvVarNames: [...DOI_PASSWORD_FALLBACK_ENV_VARS],
        env: input.env,
      }),
    };
    return resolvedConfig;
  }
  return null;
}

export function resolveDoiPublishingBrand(input: DoiConfigurationInput, record?: DoiRecordModel): BrandingModel {
  const brandId = String(record?.metaMetadata?.brandId ?? '').trim();
  if (!brandId) {
    throw new Error('Cannot resolve DOI publishing config: record does not have a brand');
  }
  const brand = input.brandById(brandId);
  if (brand == null) {
    throw new Error(`Cannot resolve DOI publishing config: unknown brand id '${brandId}'`);
  }
  return brand;
}

export function resolveDoiPublishingConfig(
  input: DoiConfigurationInput,
  record?: DoiRecordModel
): DoiPublishing | null {
  const brandName = resolveDoiPublishingBrand(input, record).name;
  if (_.isEmpty(brandName)) {
    throw new Error('Cannot resolve DOI publishing config: resolved brand does not have a name');
  }
  return resolveBrandConfig(input, String(brandName));
}

export function resolveDoiPublishingConfigForBrand(
  input: DoiConfigurationInput,
  branding: BrandingModel | string
): DoiPublishing | null {
  const brandName = typeof branding === 'string' ? branding : branding?.name;
  if (_.isEmpty(brandName)) {
    throw new Error('Cannot resolve DOI publishing config: brand name is required');
  }
  return resolveBrandConfig(input, String(brandName));
}

export async function resolveDoiPublishingConfigAsync(
  input: DoiConfigurationInput,
  record?: DoiRecordModel
): Promise<DoiPublishing | null> {
  // Always use cached branding-aware config; do not hit AppConfigService
  return resolveDoiPublishingConfig(input, record);
}
