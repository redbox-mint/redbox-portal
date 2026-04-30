import _ from 'lodash';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { RecordModel, FigsharePublicationPlan, FigshareSyncState, DataLocationEntry, getRecordField } from './types';
import { setSyncState } from './config';

export function getSelectedDataLocations(config: FigsharePublishingConfigData, record: RecordModel): DataLocationEntry[] {
  const dataLocations = (getRecordField(record, config.record.dataLocationsPath) ?? []) as DataLocationEntry[];
  return dataLocations.filter((entry) => {
    if (entry == null || typeof entry !== 'object') {
      return false;
    }

    if (entry.type === 'attachment') {
      return config.selection.attachmentMode === 'all' || entry[config.selection.selectedFlagPath] === true;
    }

    if (entry.type === 'url') {
      return config.selection.urlMode === 'all' || entry[config.selection.selectedFlagPath] === true;
    }

    return false;
  });
}

export function preparePublication(config: FigsharePublishingConfigData, record: RecordModel, existingState: FigshareSyncState, correlationId: string): FigsharePublicationPlan {
  const sameJob = existingState.lockOwner === correlationId;
  const existingArticleId = getRecordField(record, config.record.articleIdPath);
  if (!sameJob && (existingState.status === 'syncing' || existingState.status === 'awaiting_upload_completion')) {
    sails.log.warn(`FigService v2 - skipping duplicate sync for record ${record.redboxOid ?? record.id}`);
    return { action: 'skip', articleId: existingArticleId ? String(existingArticleId) : undefined, sameJob: false, syncState: existingState };
  }

  const hasArticleId = existingArticleId != null && existingArticleId !== '';
  const action = !hasArticleId
    ? 'create'
    : existingState.status === 'published' && (config.article.republishOnMetadataChange || config.article.republishOnAssetChange)
      ? 'republish'
      : 'update';

  const syncState: FigshareSyncState = {
    ...existingState,
    status: 'syncing',
    lockOwner: correlationId,
    correlationId,
    lastError: '',
    lastSyncAt: new Date().toISOString()
  };
  setSyncState(config, record, syncState);

  return {
    action,
    articleId: hasArticleId ? String(existingArticleId) : undefined,
    sameJob,
    syncState
  };
}
