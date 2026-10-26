import type { FigshareFixtureConfig, FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { FigshareSyncState, getRecordField, setRecordField, RecordModel } from '../../services/figshare-v2/types';
export interface ResolvedFigsharePublishingConfigData extends FigsharePublishingConfigData {
  /** Keeps source saves valid while preventing queued execution until configuration is corrected. */
  processingError?: string;
  runtime: {
    mode: 'live' | 'fixture';
    fixtures?: FigshareFixtureConfig;
  };
}

export function getSyncState(config: FigsharePublishingConfigData, record: RecordModel): FigshareSyncState {
  return (getRecordField(record, config.record.syncStatePath) as FigshareSyncState) ?? { status: 'idle' };
}

export function setSyncState(
  config: FigsharePublishingConfigData,
  record: RecordModel,
  syncState: FigshareSyncState
): void {
  setRecordField(record, config.record.syncStatePath, {
    ...syncState,
    lastSyncAt: syncState.lastSyncAt ?? new Date().toISOString(),
  });
  setRecordField(record, config.record.statusPath, syncState.status);
  setRecordField(record, config.record.errorPath, syncState.lastError ?? '');
}

import type { FigshareDevConfig } from '../../config/figshareDev.config';
import type { BrandingModel } from '../../model/storage/BrandingModel';
import { resolveFigsharePublishingConfigData } from '../../queries/FigshareStatus';
import { resolveFigshareVocabularyConfigData } from '../../vocabulary/FigshareConfiguration';

export interface FigshareConfigurationInput {
  configuration(name: string): unknown;
  brandById(value: string): BrandingModel | undefined;
  brandByName(value: string): BrandingModel | undefined;
  readonly development: FigshareDevConfig;
  readonly environment: string;
  readonly log: { warn(message: string): void };
}

export function createFigshareConfiguration(input: FigshareConfigurationInput) {
  function getBrandName(record?: Record<string, unknown>): string {
    if (record == null) return 'default';
    const rm = record as RecordModel;
    const rawBrand = String(rm.metaMetadata?.brandId ?? record.branding ?? '').trim();
    if (rawBrand === '') return 'default';
    const byId = input.brandById(rawBrand);
    if (byId?.name && String(byId.name).trim() !== '') return String(byId.name);
    if (input.brandByName(rawBrand)) return rawBrand;
    input.log.warn(
      `FigService - unable to resolve brand id or name '${rawBrand}'; global branding configuration defaults will apply`
    );
    return rawBrand;
  }
  function resolveFigsharePublishingConfig(
    record?: Record<string, unknown>,
    options: { requireToken?: boolean } = {}
  ): ResolvedFigsharePublishingConfigData | null {
    const brandName = getBrandName(record);
    return resolveFigsharePublishingConfigData(
      input.configuration(brandName) ?? input.configuration('default'),
      input.development,
      input.environment,
      options
    );
  }
  function resolveFigshareVocabularyConfig(brandName: string): ResolvedFigsharePublishingConfigData | null {
    return resolveFigshareVocabularyConfigData(
      input.configuration(brandName) ?? input.configuration('default'),
      input.development,
      input.environment
    );
  }
  return { getBrandName, resolveFigsharePublishingConfig, resolveFigshareVocabularyConfig };
}
