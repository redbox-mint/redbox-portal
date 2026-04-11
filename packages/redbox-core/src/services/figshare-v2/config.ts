import _ from 'lodash';
import {
  FigsharePublishing,
  resolveFigshareConnectionToken,
  type FigshareLegacyMappingConfig,
  type FigsharePublishingConfigData
} from '../../configmodels/FigsharePublishing';
import { FigshareSyncState, getRecordField, setRecordField, RecordModel } from './types';
import { ServiceExports } from '../index';

export function getBrandName(record?: RecordModel): string {
  if (record == null) return 'default';
  const rm = record as RecordModel;
  return rm.metaMetadata?.brandId ?? (record as Record<string, unknown>).branding as string ?? 'default';
}

export function resolveFigsharePublishingConfig(record?: RecordModel): FigsharePublishingConfigData | null {
  const brandName = getBrandName(record);
  const appConfigService = ServiceExports.AppConfigService as { getAppConfigurationForBrand?: (name: string) => unknown } | undefined;
  const brandConfig = appConfigService?.getAppConfigurationForBrand?.(brandName) ?? appConfigService?.getAppConfigurationForBrand?.('default');
  const brandConfigRecord = brandConfig != null && typeof brandConfig === 'object' ? brandConfig as Record<string, unknown> : undefined;
  const figsharePublishing = brandConfigRecord?.figsharePublishing;
  const figsharePublishingConfig = figsharePublishing != null && typeof figsharePublishing === 'object'
    ? figsharePublishing as Partial<FigsharePublishingConfigData>
    : undefined;
  if (figsharePublishingConfig?.enabled === true) {
    const resolvedConfig = _.merge(new FigsharePublishing(), _.cloneDeep(figsharePublishingConfig)) as FigsharePublishingConfigData;
    const legacyConfig = (sails.config as Record<string, unknown>).figshareAPI as Record<string, unknown> | undefined;
    const legacyMapping = legacyConfig?.mapping;
    if (resolvedConfig.legacyMapping == null && legacyMapping != null && typeof legacyMapping === 'object') {
      resolvedConfig.legacyMapping = legacyMapping as FigshareLegacyMappingConfig;
    }

    const connectionToken = resolvedConfig.connection?.token;
    const allowEmpty = resolvedConfig.testing?.mode === 'fixture';
    if (typeof connectionToken === 'string' && connectionToken.trim() !== '') {
      resolvedConfig.connection.token = resolveFigshareConnectionToken(connectionToken, { allowEmpty });
    } else if (!allowEmpty) {
      resolvedConfig.connection.token = resolveFigshareConnectionToken('', { allowEmpty: false });
    } else if (resolvedConfig.connection != null) {
      resolvedConfig.connection.token = '';
    }

    return resolvedConfig;
  }
  return null;
}

export function getSyncState(config: FigsharePublishingConfigData, record: RecordModel): FigshareSyncState {
  return (getRecordField(record, config.record.syncStatePath) as FigshareSyncState) ?? { status: 'idle' };
}

export function setSyncState(config: FigsharePublishingConfigData, record: RecordModel, syncState: FigshareSyncState): void {
  setRecordField(record, config.record.syncStatePath, {
    ...syncState,
    lastSyncAt: syncState.lastSyncAt ?? new Date().toISOString()
  });
  setRecordField(record, config.record.statusPath, syncState.status);
  setRecordField(record, config.record.errorPath, syncState.lastError ?? '');
}
