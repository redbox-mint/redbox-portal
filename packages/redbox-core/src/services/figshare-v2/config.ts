import _ from 'lodash';
import { resolveFigshareConnectionToken, type FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { AnyRecord, FigshareSyncState, RecordLike } from './types';

export function getBrandName(record?: RecordLike): string {
  return String(_.get(record as AnyRecord, 'metaMetadata.branding', _.get(record as AnyRecord, 'branding', 'default')) || 'default');
}

export function resolveFigsharePublishingConfig(record?: RecordLike): FigsharePublishingConfigData | null {
  const brandName = getBrandName(record);
  const brandConfig = AppConfigService?.getAppConfigurationForBrand?.(brandName) ?? AppConfigService?.getAppConfigurationForBrand?.('default');
  const figsharePublishing = _.get(brandConfig, 'figsharePublishing') as Partial<FigsharePublishingConfigData> | undefined;
  if (figsharePublishing && _.isPlainObject(figsharePublishing) && figsharePublishing.enabled === true) {
    const resolvedFigsharePublishing = figsharePublishing as FigsharePublishingConfigData;
    const resolvedConfig = _.cloneDeep(resolvedFigsharePublishing);
    resolvedConfig.connection.token = resolveFigshareConnectionToken(resolvedConfig.connection.token, {
      allowEmpty: resolvedConfig.testing.mode === 'fixture'
    });
    return resolvedConfig;
  }
  return null;
}

export function getSyncState(config: FigsharePublishingConfigData, record: AnyRecord) {
  return (_.get(record, config.record.syncStatePath, { status: 'idle' }) || { status: 'idle' });
}

export function setSyncState(config: FigsharePublishingConfigData, record: AnyRecord, syncState: AnyRecord | FigshareSyncState): void {
  _.set(record, config.record.syncStatePath, {
    ...syncState,
    lastSyncAt: syncState.lastSyncAt ?? new Date().toISOString()
  });
  _.set(record, config.record.statusPath, syncState.status);
  _.set(record, config.record.errorPath, syncState.lastError ?? '');
}
