import _ from 'lodash';
import {
  FigsharePublishing,
  resolveFigshareConnectionToken,
  type FigshareFixtureConfig,
  type FigsharePublishingConfigData
} from '../../configmodels/FigsharePublishing';
import type { FigshareDevConfig } from '../../config/figshareDev.config';
import { FigshareSyncState, getRecordField, setRecordField, RecordModel } from './types';
import { ServiceExports } from '../index';

export interface ResolvedFigsharePublishingConfigData extends FigsharePublishingConfigData {
  runtime: {
    mode: 'live' | 'fixture';
    fixtures?: FigshareFixtureConfig;
  };
}

export function getBrandName(record?: RecordModel): string {
  if (record == null) return 'default';
  const rm = record as RecordModel;
  const rawBrand = String(rm.metaMetadata?.brandId ?? (record as Record<string, unknown>).branding ?? '').trim();
  if (rawBrand === '') return 'default';

  // `metaMetadata.brandId` holds the brand id, but AppConfigService keys its per-brand
  // config map by brand NAME - resolve id -> name (mirrors doi-v2/config). Without this,
  // id lookups silently fall through to the global brandingConfigurationDefaults and
  // per-brand admin-UI overrides are ignored.
  const brandingService = typeof BrandingService === 'undefined' ? undefined : BrandingService;
  if (brandingService == null) return rawBrand;
  const brandById = typeof brandingService.getBrandById === 'function' ? brandingService.getBrandById(rawBrand) : undefined;
  if (brandById?.name != null && String(brandById.name).trim() !== '') {
    return String(brandById.name);
  }
  // Some callers (queue jobs, the workflow transition job) already pass a brand name.
  const brandByName = typeof brandingService.getBrand === 'function' ? brandingService.getBrand(rawBrand) : undefined;
  if (brandByName != null) return rawBrand;
  // Unknown brand (e.g. deleted): do NOT throw - resolveFigsharePublishingConfig must keep
  // its `null -> graceful no-op` contract for lifecycle hooks (createUpdateFigshareArticle,
  // uploadFilesToFigshareArticle, ...). Returning the raw value preserves the previous
  // fallback semantics (AppConfigService serves the global brandingConfigurationDefaults
  // for unknown keys), now with a warning instead of silence.
  sails.log.warn(`FigService - unable to resolve brand id or name '${rawBrand}'; global branding configuration defaults will apply`);
  return rawBrand;
}

function resolveFigshareDevConfig(): FigshareDevConfig {
  const rawConfig = sails.config?.figshareDev;
  if (rawConfig == null || typeof rawConfig !== 'object') {
    return { enabled: false, mode: 'live' };
  }
  return rawConfig as FigshareDevConfig;
}

function shouldUseFixtureRuntime(figshareDev: FigshareDevConfig): boolean {
  const environment = String(sails.config?.environment ?? process.env.NODE_ENV ?? '').toLowerCase();
  if (environment === 'production') {
    return false;
  }
  return figshareDev.enabled === true && figshareDev.mode === 'fixture';
}

export function resolveFigsharePublishingConfig(record?: RecordModel): ResolvedFigsharePublishingConfigData | null {
  const brandName = getBrandName(record);
  const appConfigService = ServiceExports.AppConfigService as { getAppConfigurationForBrand?: (name: string) => unknown } | undefined;
  const brandConfig = appConfigService?.getAppConfigurationForBrand?.(brandName) ?? appConfigService?.getAppConfigurationForBrand?.('default');
  const brandConfigRecord = brandConfig != null && typeof brandConfig === 'object' ? brandConfig as Record<string, unknown> : undefined;
  const figsharePublishing = brandConfigRecord?.figsharePublishing;
  const figsharePublishingConfig = figsharePublishing != null && typeof figsharePublishing === 'object'
    ? figsharePublishing as Partial<FigsharePublishingConfigData>
    : undefined;
  if (figsharePublishingConfig?.enabled === true) {
    const resolvedConfig = _.merge(new FigsharePublishing(), _.cloneDeep(figsharePublishingConfig)) as unknown as ResolvedFigsharePublishingConfigData;
    const figshareDev = resolveFigshareDevConfig();
    const useFixtureRuntime = shouldUseFixtureRuntime(figshareDev);
    resolvedConfig.runtime = {
      mode: useFixtureRuntime ? 'fixture' : 'live',
      fixtures: useFixtureRuntime ? _.cloneDeep(figshareDev.fixtures) : undefined
    };
    const resolvedConnection = resolvedConfig.connection != null && typeof resolvedConfig.connection === 'object'
      ? resolvedConfig.connection
      : { ...new FigsharePublishing().connection };
    resolvedConfig.connection = resolvedConnection;
    const connectionToken = resolvedConfig.connection?.token;
    const allowEmpty = resolvedConfig.runtime.mode === 'fixture';
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
