import _ from 'lodash';
import { resolveFigshareConnectionToken, type FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { FigshareSyncState, getRecordField, setRecordField, RecordModel } from './types';

export function getBrandName(record?: RecordModel): string {
  if (record == null) return 'default';
  const rm = record as RecordModel;
  return rm.metaMetadata?.brandId ?? (record as Record<string, unknown>).branding as string ?? 'default';
}

export function resolveFigsharePublishingConfig(record?: RecordModel): FigsharePublishingConfigData | null {
  const brandName = getBrandName(record);
  const brandConfig = AppConfigService?.getAppConfigurationForBrand?.(brandName) ?? AppConfigService?.getAppConfigurationForBrand?.('default');
  const figsharePublishing = (brandConfig as unknown as Record<string, unknown>)?.figsharePublishing as Partial<FigsharePublishingConfigData> | undefined;
  if (figsharePublishing && typeof figsharePublishing === 'object' && figsharePublishing.enabled === true) {
    const resolvedConfig = _.cloneDeep(figsharePublishing) as FigsharePublishingConfigData;
    resolvedConfig.connection.token = resolveFigshareConnectionToken(resolvedConfig.connection.token, {
      allowEmpty: resolvedConfig.testing.mode === 'fixture'
    });
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
