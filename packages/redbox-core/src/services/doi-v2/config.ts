import _ from 'lodash';
import {
  DoiPublishing,
  resolveDoiConnectionPassword
} from '../../configmodels/DoiPublishing';
import type { DoiRecordModel, ResolvedDoiPublishingConfigData } from './types';

type AppConfigServiceLike = {
  getAppConfigurationForBrand?: (name: string) => unknown;
  getAppConfigByBrandAndKey?: (brandId: string, key: string) => Promise<unknown>;
  createConfig?: (brandName: string, key: string, configData: Record<string, unknown>) => Promise<unknown>;
};

function getAppConfigService(): AppConfigServiceLike | undefined {
  const globalService = (global as Record<string, unknown>).AppConfigService;
  if (globalService != null && typeof globalService === 'object') {
    return globalService as AppConfigServiceLike;
  }
  const sailsService = sails.services?.appconfigservice;
  if (sailsService != null && typeof sailsService === 'object') {
    return sailsService as AppConfigServiceLike;
  }
  return undefined;
}

export function getBrandName(record?: DoiRecordModel): string {
  if (record == null) {
    return 'default';
  }
  return record.metaMetadata?.brandId ?? record.branding ?? 'default';
}

export function resolveDoiPublishingConfig(
  record?: DoiRecordModel
): ResolvedDoiPublishingConfigData | null {
  const brandName = getBrandName(record);
  const appConfigService = getAppConfigService();
  const brandConfig = appConfigService?.getAppConfigurationForBrand?.(brandName) ?? appConfigService?.getAppConfigurationForBrand?.('default');
  const brandConfigRecord = brandConfig != null && typeof brandConfig === 'object' ? brandConfig as Record<string, unknown> : undefined;
  const storedConfig = brandConfigRecord?.doiPublishing;
  const appConfig = storedConfig != null && typeof storedConfig === 'object'
    ? _.merge(new DoiPublishing(), _.cloneDeep(storedConfig)) as unknown as ResolvedDoiPublishingConfigData
    : null;

  if (appConfig?.enabled === true) {
    appConfig.runtime = { source: 'appConfig' };
    appConfig.connection.password = resolveDoiConnectionPassword(appConfig.connection.password);
    return appConfig;
  }

  return null;
}
